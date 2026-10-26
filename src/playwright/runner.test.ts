import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { aFailure } from "../testing/builders.ts";
import { PlaywrightRunner } from "./runner.ts";

let root: string;

const failure = aFailure({
  title: "checkout",
  location: { file: "tests/checkout[api].spec.ts", line: 12, column: 1 },
});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "aita-runner-test-"));
  const cli = path.join(root, "node_modules", "@playwright", "test");
  await mkdir(cli, { recursive: true });
  await writeFile(
    path.join(cli, "cli.js"),
    `
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const args = process.argv.slice(2);
  const output = args[args.indexOf("--output") + 1] || "test-results";
  const reportFile = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  await fs.appendFile("invocations.jsonl", JSON.stringify({ args, output, reportFile }) + "\\n");
  const lock = await fs.open("running.lock", "wx");
  const fixture = JSON.parse(await fs.readFile("fixture.json", "utf8"));
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "rerun.txt"), "rerun evidence");
  await new Promise((resolve) => setTimeout(resolve, fixture.delay || 50));
  await fs.writeFile(reportFile, JSON.stringify(fixture.report));
  await lock.close();
  await fs.rm("running.lock");
  process.exitCode = fixture.exitCode || 0;
}

main().catch((error) => { console.error(error); process.exitCode = 2; });
`,
  );
  await writeFixture();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function writeFixture(overrides: Record<string, unknown> = {}) {
  const test = {
    projectName: "api",
    status: "expected",
    results: [{ retry: 0, status: "passed", duration: 10 }],
  };
  const spec = {
    title: failure.title,
    file: "checkout[api].spec.ts",
    line: 12,
    column: 1,
    tests: [test, { ...test, projectName: "setup" }],
  };
  await writeFile(
    path.join(root, "fixture.json"),
    JSON.stringify({
      report: {
        config: {
          configFile: path.join(root, "playwright.config.ts"),
          rootDir: path.join(root, "tests"),
        },
        suites: [
          {
            title: "checkout[api].spec.ts",
            specs: [spec, { ...spec, title: "another generated test" }],
          },
        ],
      },
      ...overrides,
    }),
  );
}

async function invocations(): Promise<
  { args: string[]; output: string; reportFile: string }[]
> {
  const content = await readFile(path.join(root, "invocations.jsonl"), "utf8");
  return content
    .trim()
    .split("\n")
    .map((line) =>
      z
        .object({
          args: z.array(z.string()),
          output: z.string(),
          reportFile: z.string(),
        })
        .parse(JSON.parse(line)),
    );
}

describe("PlaywrightRunner", () => {
  it("handles relative roots, literal file names and isolated output", async () => {
    await mkdir(path.join(root, "test-results"));
    const evidence = path.join(root, "test-results", "original.txt");
    await writeFile(evidence, "original evidence");
    const inheritedReport = path.join(root, "original-report.json");
    await writeFile(inheritedReport, "original report");
    vi.stubEnv("PLAYWRIGHT_JSON_OUTPUT_FILE", inheritedReport);

    const outcome = await new PlaywrightRunner(
      path.relative(process.cwd(), root),
    ).rerun(failure, "api", 1);

    expect(outcome).toEqual({
      project: "api",
      runs: 1,
      passed: 1,
      failed: 0,
      errors: [],
    });
    expect(await readFile(evidence, "utf8")).toBe("original evidence");
    expect(await readFile(inheritedReport, "utf8")).toBe("original report");
    const [invocation] = await invocations();
    expect(invocation).toBeDefined();
    if (invocation === undefined) throw new Error("No invocation recorded");
    const filter = new RegExp(invocation.args[1]?.replace(/:12$/, "") ?? "");
    const selectedFile = path.join(root, "tests", "checkout[api].spec.ts");
    expect(filter.test(selectedFile)).toBe(true);
    expect(filter.test(selectedFile.replaceAll("\\", "/"))).toBe(true);
    expect(filter.test(path.join(root, "tests", "checkouta.spec.ts"))).toBe(
      false,
    );
    expect(
      filter.test(path.join(root, "generated-tests", "checkout[api].spec.ts")),
    ).toBe(false);
    await expect(readFile(invocation.reportFile)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(path.join(invocation.output, "rerun.txt")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("serializes reruns in the same workspace", async () => {
    const runner = new PlaywrightRunner(root);
    const outcomes = await Promise.all([
      runner.rerun(failure, "api", 1),
      runner.rerun(failure, "api", 1),
    ]);

    expect(outcomes.map((outcome) => outcome.passed)).toEqual([1, 1]);
    const calls = await invocations();
    expect(new Set(calls.map((call) => call.output)).size).toBe(2);
  });

  it("reports setup errors when the selected test never ran", async () => {
    await writeFixture({
      report: {
        config: { rootDir: root },
        errors: [{ message: "The database is unavailable" }],
      },
      exitCode: 1,
    });

    expect(await new PlaywrightRunner(root).rerun(failure, "api", 1)).toEqual({
      project: "api",
      runs: 0,
      passed: 0,
      failed: 0,
      errors: [
        "The database is unavailable",
        "The selected test did not complete any runs.",
      ],
    });
  });

  it("rejects process failures even with a report and allows the next rerun", async () => {
    const runner = new PlaywrightRunner(root);
    await writeFixture({ exitCode: 2 });

    await expect(runner.rerun(failure, "api", 1)).rejects.toThrow(
      "Playwright could not complete",
    );

    await writeFixture();
    expect(await runner.rerun(failure, "api", 1)).toMatchObject({
      runs: 1,
      passed: 1,
      errors: [],
    });
  });
});
