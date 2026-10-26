import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { Failure } from "../domain/failure.ts";
import type { RerunOutcome, TestRunner } from "../playwright/runner.ts";
import { exists } from "./cases.ts";

export const recordingsSchema = z
  .array(
    z
      .object({
        project: z.string(),
        runs: z.number().int().nonnegative(),
        passed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        errors: z.array(z.string()),
      })
      .refine(
        (recording) => recording.runs === recording.passed + recording.failed,
        {
          message: "Recorded runs must equal passed plus failed runs",
        },
      ),
  )
  .refine(
    (recordings) =>
      new Set(recordings.map((recording) => recording.project)).size ===
      recordings.length,
    { message: "Each project must have exactly one rerun recording" },
  );

export class RecordedRunner implements TestRunner {
  readonly #recordings: RerunOutcome[];

  constructor(recordings: RerunOutcome[]) {
    this.#recordings = recordings;
  }

  static async load(file: string): Promise<RecordedRunner | undefined> {
    if (!(await exists(file))) return undefined;
    const content: unknown = JSON.parse(await readFile(file, "utf8"));
    return new RecordedRunner(recordingsSchema.parse(content));
  }

  rerun(_failure: Failure, project: string): Promise<RerunOutcome> {
    const recording = this.#recordings.find((item) => item.project === project);
    return recording === undefined
      ? Promise.reject(new Error(`The test cannot be rerun in ${project}.`))
      : Promise.resolve(recording);
  }
}
