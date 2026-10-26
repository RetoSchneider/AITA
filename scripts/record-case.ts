import { execFile, spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseArgs, promisify } from "node:util";

import { z } from "zod";

import type { Failure } from "../src/domain/failure.ts";
import { exists, loadCases, loadSuite } from "../src/evaluation/cases.ts";
import type { EvaluationCase } from "../src/evaluation/cases.ts";
import { collectFailures, reportSchema } from "../src/playwright/report.ts";
import type { RerunOutcome } from "../src/playwright/runner.ts";
import { rerunOutcome, testFilePattern } from "../src/playwright/runner.ts";
import { git } from "../src/shared/git.ts";
import { toPosix } from "../src/shared/text.ts";
import { resolveInside } from "../src/workspace/paths.ts";

const execFileAsync = promisify(execFile);

const neutralRoot = "/workspace/seatwise";
const databaseUrl =
  "postgresql://seatwise:seatwise@127.0.0.1:55432/seatwise_test?schema=public";

const recordingSchema = z.object({
  test: z.string(),
  projects: z.array(z.string()).default([]),
  stop: z.array(z.string()).default([]),
  occupyPort: z.number().int().min(1).max(65535).optional(),
  env: z.record(z.string(), z.string()).default({}),
  reruns: z.number().int().nonnegative().default(0),
  attempts: z.number().int().positive().default(1),
});

type Recording = z.output<typeof recordingSchema>;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seatwise: { type: "string", default: "../SeatWise" },
    cases: { type: "string", default: "eval/cases" },
    suite: { type: "string", default: "eval/suite.json" },
    workspace: { type: "string", default: ".cache/recording" },
  },
});

const suite = await loadSuite(values.suite);
const cases = await loadCases(values.cases, positionals);
const root = path.resolve(values.workspace, "seatwise");
await prepareWorkspace(path.resolve(values.seatwise), root, suite.revision);

for (const testCase of cases) {
  await record(testCase, root, suite.revision);
}

async function record(
  testCase: EvaluationCase,
  workspace: string,
  revision: string,
): Promise<void> {
  const recording = await readRecording(testCase);
  log(`Recording ${testCase.id}`);
  await checkout(workspace, revision, testCase);
  await startServices(workspace);
  const captured = await withEnvironment(workspace, recording, () =>
    capture(testCase, workspace, recording),
  );
  if (!captured) {
    throw new Error(
      `${testCase.id} produced no failure in ${recording.attempts} attempts`,
    );
  }
}

async function capture(
  testCase: EvaluationCase,
  workspace: string,
  recording: Recording,
): Promise<boolean> {
  for (let attempt = 1; attempt <= recording.attempts; attempt += 1) {
    const report = await runPlaywright(
      workspace,
      [
        recording.test,
        ...recording.projects.flatMap((project) => ["--project", project]),
      ],
      recording.env,
    );
    const failures = collectFailures(reportSchema.parse(report));
    const [failure] = failures;
    if (failure === undefined) {
      log(`Attempt ${attempt}: no failure`);
      continue;
    }
    if (failures.length !== 1) {
      throw new Error(
        `${testCase.id} produced ${failures.length} failures; each evaluation case must record exactly one`,
      );
    }
    log(
      `Attempt ${attempt}: ${failure.title} failed in [${failure.failedIn.join(", ")}], passed on retry in [${failure.flakyIn.join(", ")}]`,
    );

    const sanitized = sanitize(report, workspace);
    assertAnonymous(sanitized);
    await rm(path.join(testCase.directory, "test-results"), {
      recursive: true,
      force: true,
    });
    await rm(testCase.reruns, { force: true });
    await writeFile(testCase.report, `${JSON.stringify(sanitized, null, 2)}\n`);
    await copyAttachments(sanitized, workspace, testCase.directory);

    if (recording.reruns > 0 && failure.kind === "test") {
      const outcomes: RerunOutcome[] = [];
      for (const project of [...failure.failedIn, ...failure.flakyIn]) {
        outcomes.push(await rerun(workspace, failure, project, recording));
      }
      await writeFile(
        testCase.reruns,
        `${JSON.stringify(outcomes, null, 2)}\n`,
      );
    }
    return true;
  }
  return false;
}

async function readRecording(testCase: EvaluationCase): Promise<Recording> {
  const definition = z
    .object({ recording: recordingSchema })
    .parse(
      JSON.parse(
        await readFile(path.join(testCase.directory, "case.json"), "utf8"),
      ),
    );
  return definition.recording;
}

async function prepareWorkspace(
  source: string,
  workspace: string,
  revision: string,
): Promise<void> {
  const sourceRoot = await realpath(source);
  if (path.resolve(workspace) === sourceRoot) {
    throw new Error(
      "The recording workspace must be separate from the source repository",
    );
  }
  if (!(await exists(workspace))) {
    await mkdir(path.dirname(workspace), { recursive: true });
    await git(path.dirname(workspace), [
      "clone",
      "--quiet",
      "--config",
      "core.autocrlf=false",
      source,
      workspace,
    ]);
  }
  const workspaceRoot = await realpath(workspace);
  const checkoutRoot = await realpath(
    (await git(workspace, ["rev-parse", "--show-toplevel"])).trim(),
  );
  const origin = (await git(workspace, ["remote", "get-url", "origin"])).trim();
  if (
    workspaceRoot === sourceRoot ||
    workspaceRoot !== checkoutRoot ||
    !(await exists(origin)) ||
    (await realpath(origin)) !== sourceRoot
  ) {
    throw new Error(
      "The recording workspace must be a dedicated clone of the selected source repository",
    );
  }
  await git(workspace, [
    "checkout",
    "--quiet",
    "--force",
    "--detach",
    revision,
  ]);
  if (!(await exists(path.join(workspace, "node_modules")))) {
    await pnpm(workspace, ["install", "--frozen-lockfile"]);
  }
  if (!(await exists(path.join(workspace, "src", "generated", "prisma")))) {
    await pnpm(workspace, ["db:generate"]);
  }
}

async function checkout(
  workspace: string,
  revision: string,
  testCase: EvaluationCase,
): Promise<void> {
  await git(workspace, [
    "checkout",
    "--quiet",
    "--force",
    "--detach",
    revision,
  ]);
  await git(workspace, [
    "clean",
    "-fdx",
    "--quiet",
    "-e",
    "node_modules",
    "-e",
    ".next",
    "-e",
    "src/generated",
  ]);
  if (testCase.patch !== undefined) {
    await git(workspace, ["apply", "--whitespace=nowarn", testCase.patch]);
  }
}

async function startServices(workspace: string): Promise<void> {
  await run(
    "docker",
    ["compose", "-f", "compose.test.yaml", "up", "-d", "--wait"],
    workspace,
  );
  await pnpm(workspace, ["test:db:prepare"]);
}

async function withEnvironment<Result>(
  workspace: string,
  recording: Recording,
  task: () => Promise<Result>,
): Promise<Result> {
  const services = recording.stop;
  const blocker =
    recording.occupyPort === undefined
      ? undefined
      : await occupy(recording.occupyPort);
  try {
    if (services.length > 0) {
      await run(
        "docker",
        ["compose", "-f", "compose.test.yaml", "stop", ...services],
        workspace,
      );
    }
    return await task();
  } finally {
    blocker?.close();
    if (services.length > 0) await startServices(workspace);
  }
}

async function runPlaywright(
  workspace: string,
  args: string[],
  env: Record<string, string>,
): Promise<unknown> {
  const directory = await mkdtemp(path.join(tmpdir(), "aita-recording-"));
  const output = path.join(directory, "report.json");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join("node_modules", "@playwright", "test", "cli.js"),
          "test",
          ...args,
          "--reporter",
          "json",
        ],
        {
          cwd: workspace,
          env: {
            ...process.env,
            ...Object.fromEntries(
              Object.entries(env).map(([name, value]) => [
                name,
                value.replaceAll("{workspace}", workspace),
              ]),
            ),
            CI: "1",
            PLAYWRIGHT_JSON_OUTPUT_FILE: output,
          },
          stdio: "inherit",
          timeout: 20 * 60 * 1000,
        },
      );
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (signal !== null || (code !== 0 && code !== 1)) {
          reject(
            new Error(
              `Playwright could not complete: ${signal ?? String(code)}`,
            ),
          );
        } else {
          resolve();
        }
      });
    });
    return JSON.parse(await readFile(output, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function rerun(
  workspace: string,
  failure: Failure,
  project: string,
  recording: Recording,
): Promise<RerunOutcome> {
  log(`Rerunning ${project} ${recording.reruns} times`);
  const report = await runPlaywright(
    workspace,
    [
      `${testFilePattern(workspace, failure.location.file)}:${failure.location.line}`,
      "--project",
      project,
      "--repeat-each",
      String(recording.reruns),
      "--retries",
      "0",
    ],
    recording.env,
  );
  const parsed = reportSchema.parse(sanitize(report, workspace));
  return rerunOutcome(parsed, failure, project);
}

async function copyAttachments(
  report: unknown,
  workspace: string,
  destination: string,
): Promise<void> {
  const failures = collectFailures(reportSchema.parse(report));
  for (const attachment of failures.flatMap((failure) => failure.attachments)) {
    if (attachment.path === undefined) continue;
    const source = await resolveInside(workspace, attachment.path);
    const target = path.resolve(destination, attachment.path);
    const relative = path.relative(path.resolve(destination), target);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Attachment ${attachment.path} is outside the case directory`,
      );
    }
    await mkdir(path.dirname(target), { recursive: true });
    await resolveInside(destination, path.dirname(target));
    if (await exists(target)) await resolveInside(destination, target);
    if (attachment.contentType.startsWith("image/")) {
      await cp(source, target);
      continue;
    }
    const text = sanitizeText(await readFile(source, "utf8"), workspace);
    assertAnonymous(text);
    await writeFile(target, text);
  }
}

function sanitizeText(text: string, workspace: string): string {
  const rootPattern = new RegExp(
    `${flexibleSeparators(workspace)}([^\\s"'\`)]*)`,
    "gi",
  );
  const homePattern = new RegExp(flexibleSeparators(homedir()), "gi");
  return text
    .replace(
      rootPattern,
      (_match, rest: string) => `${neutralRoot}${toPosix(rest)}`,
    )
    .replace(homePattern, "~");
}

function sanitize(value: unknown, workspace: string): unknown {
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") return sanitizeText(node, workspace);
    if (Array.isArray(node)) return node.map(visit);
    if (typeof node === "object" && node !== null) {
      return Object.fromEntries(
        Object.entries(node).map(([key, inner]) => [key, visit(inner)]),
      );
    }
    return node;
  };
  return visit(value);
}

function assertAnonymous(content: unknown): void {
  const text = toPosix(
    JSON.stringify(content).replaceAll("\\\\", "/"),
  ).toLowerCase();
  const leaked = [homedir(), process.cwd()]
    .map((directory) => toPosix(directory).toLowerCase())
    .filter((directory) => text.includes(directory));
  if (leaked.length > 0) {
    throw new Error(`The recording still contains ${leaked.join(", ")}`);
  }
}

function flexibleSeparators(directory: string): string {
  return toPosix(directory)
    .split("/")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join(String.raw`[\\/]`);
}

async function occupy(port: number): Promise<Server> {
  const server = createServer((_request, response) => {
    response.end("ok");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  return server;
}

async function pnpm(workspace: string, args: string[]): Promise<void> {
  await run("pnpm", args, workspace, { DATABASE_URL: databaseUrl });
}

async function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<void> {
  await execFileAsync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: process.platform === "win32" && command === "pnpm",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}
