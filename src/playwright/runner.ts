import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { Failure } from "../domain/failure.ts";
import { messageOf } from "../shared/text.ts";
import { countResults, readReport } from "./report.ts";

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

  constructor(root: string, timeoutMs = 20 * 60 * 1000) {
    this.#root = root;
    this.#timeoutMs = timeoutMs;
  }

  async rerun(
    failure: Failure,
    project: string,
    times: number,
  ): Promise<RerunOutcome> {
    const output = path.join(tmpdir(), `aita-${randomUUID()}.json`);
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
          `${failure.location.file}:${failure.location.line}`,
          "--project",
          project,
          "--repeat-each",
          String(times),
          "--retries",
          "0",
          "--reporter",
          "json",
        ],
        {
          cwd: this.#root,
          env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: output },
          timeout: this.#timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
        },
      ).then(
        () => undefined,
        (error: unknown) => error,
      );
      const report = await readReport(output).catch(() => {
        throw new Error(
          `Playwright produced no report: ${exit === undefined ? "no output" : messageOf(exit)}`,
        );
      });
      const counts = countResults(report);
      return { project, runs: counts.passed + counts.failed, ...counts };
    } finally {
      await rm(output, { force: true });
    }
  }
}
