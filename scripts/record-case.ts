import { execFile, spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseArgs, promisify } from "node:util";

import { z } from "zod";

import { exists, loadCases, loadSuite } from "../src/evaluation/cases.ts";
import type { EvaluationCase } from "../src/evaluation/cases.ts";
import {
  collectFailures,
  countResults,
  reportSchema,
} from "../src/playwright/report.ts";
import type { RerunOutcome } from "../src/playwright/runner.ts";
import { git } from "../src/shared/git.ts";
import { toPosix } from "../src/shared/text.ts";

const execFileAsync = promisify(execFile);

const neutralRoot = "/workspace/seatwise";
const databaseUrl =
  "postgresql://seatwise:seatwise@127.0.0.1:55432/seatwise_test?schema=public";

const recordingSchema = z.object({
  test: z.string(),
  projects: z.array(z.string()).default([]),
  stop: z.array(z.string()).default([]),
  occupyPort: z.number().int().optional(),
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
    const [failure] = collectFailures(reportSchema.parse(report));
    if (failure === undefined) {
      log(`Attempt ${attempt}: no failure`);
      continue;
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
        outcomes.push(
          await rerun(workspace, failure.location, project, recording),
        );
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
  if (services.length > 0) {
    await run(
      "docker",
      ["compose", "-f", "compose.test.yaml", "stop", ...services],
      workspace,
    );
  }
  try {
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
  const output = path.join(tmpdir(), `aita-recording-${Date.now()}.json`);
  await new Promise<void>((resolve) => {
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
          PLAYWRIGHT_JSON_OUTPUT_NAME: output,
        },
        stdio: "inherit",
      },
    );
    child.on("close", () => {
      resolve();
    });
  });
  try {
    return JSON.parse(await readFile(output, "utf8"));
  } finally {
    await rm(output, { force: true });
  }
}

async function rerun(
  workspace: string,
  location: { file: string; line: number },
  project: string,
  recording: Recording,
): Promise<RerunOutcome> {
  log(`Rerunning ${project} ${recording.reruns} times`);
  const report = await runPlaywright(
    workspace,
    [
      `${location.file}:${location.line}`,
      "--project",
      project,
      "--repeat-each",
      String(recording.reruns),
      "--retries",
      "0",
    ],
    recording.env,
  );
  const counts = countResults(reportSchema.parse(sanitize(report, workspace)));
  return { project, runs: counts.passed + counts.failed, ...counts };
}

async function copyAttachments(
  report: unknown,
  workspace: string,
  destination: string,
): Promise<void> {
  const failures = collectFailures(reportSchema.parse(report));
  for (const attachment of failures.flatMap((failure) => failure.attachments)) {
    if (attachment.path === undefined) continue;
    const source = path.join(workspace, attachment.path);
    const target = path.join(destination, attachment.path);
    await mkdir(path.dirname(target), { recursive: true });
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
  await new Promise<void>((resolve) => server.listen(port, resolve));
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
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}
