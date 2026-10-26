import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { Failure } from "../domain/failure.ts";
import { messageOf, toPosix } from "../shared/text.ts";
import { countResults, readReport } from "./report.ts";
import type { PlaywrightReport } from "./report.ts";

const execFileAsync = promisify(execFile);

export interface RerunOutcome {
  project: string;
  runs: number;
  passed: number;
  failed: number;
  errors: string[];
}

export interface TestRunner {
  rerun(
    failure: Failure,
    project: string,
    times: number,
  ): Promise<RerunOutcome>;
}

export class PlaywrightRunner implements TestRunner {
  readonly #root: string;
  readonly #timeoutMs: number;
  #pending: Promise<void> = Promise.resolve();

  constructor(root: string, timeoutMs = 20 * 60 * 1000) {
    this.#root = path.resolve(root);
    this.#timeoutMs = timeoutMs;
  }

  rerun(
    failure: Failure,
    project: string,
    times: number,
  ): Promise<RerunOutcome> {
    const next = this.#pending.then(() => this.#run(failure, project, times));
    this.#pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async #run(
    failure: Failure,
    project: string,
    times: number,
  ): Promise<RerunOutcome> {
    const directory = await mkdtemp(path.join(tmpdir(), "aita-rerun-"));
    const output = path.join(directory, "report.json");
    const cli = path.join(
      this.#root,
      "node_modules",
      "@playwright",
      "test",
      "cli.js",
    );
    try {
      const exit = await execFileAsync(
        process.execPath,
        [
          cli,
          "test",
          `${testFilePattern(this.#root, failure.location.file)}:${failure.location.line}`,
          "--project",
          project,
          "--repeat-each",
          String(times),
          "--retries",
          "0",
          "--reporter",
          "json",
          "--output",
          path.join(directory, "test-results"),
        ],
        {
          cwd: this.#root,
          env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: output },
          timeout: this.#timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
        },
      ).then(
        () => undefined,
        (error: unknown) => error,
      );
      if (exit instanceof Error && "code" in exit && exit.code !== 1) {
        throw new Error(`Playwright could not complete: ${messageOf(exit)}`);
      }
      const report = await readReport(output).catch(() => {
        throw new Error(
          `Playwright produced no report: ${exit === undefined ? "no output" : messageOf(exit)}`,
        );
      });
      return rerunOutcome(report, failure, project);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function rerunOutcome(
  report: PlaywrightReport,
  failure: Failure,
  project: string,
): RerunOutcome {
  const counts = countResults(report, {
    ...failure.location,
    title: failure.title,
    project,
  });
  if (counts.passed + counts.failed === 0) {
    counts.errors = [
      ...new Set([...counts.errors, ...countResults(report).errors]),
      "The selected test did not complete any runs.",
    ];
  }
  return { project, runs: counts.passed + counts.failed, ...counts };
}

export function testFilePattern(root: string, file: string): string {
  return `^${toPosix(path.resolve(root, file))
    .split("/")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join(String.raw`[\\/]`)}$`;
}
