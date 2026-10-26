import { describe, expect, it } from "vitest";

import { aFailure } from "../testing/builders.ts";
import { RecordedRunner, recordingsSchema } from "./recorded-runner.ts";

const outcome = {
  project: "chromium",
  runs: 3,
  passed: 1,
  failed: 2,
  errors: [],
};

describe("RecordedRunner", () => {
  it("replays the recorded outcome for the requested project", async () => {
    const runner = new RecordedRunner([outcome]);

    expect(await runner.rerun(aFailure(), "chromium")).toEqual(outcome);
    await expect(runner.rerun(aFailure(), "firefox")).rejects.toThrow(
      "cannot be rerun in firefox",
    );
  });
});

describe("recordingsSchema", () => {
  it.each([
    { ...outcome, runs: -1 },
    { ...outcome, passed: 0.5, failed: 2.5 },
    { ...outcome, runs: 4 },
  ])("rejects invalid counts: %j", (recording) => {
    expect(recordingsSchema.safeParse([recording]).success).toBe(false);
  });

  it("rejects ambiguous recordings for the same project", () => {
    expect(recordingsSchema.safeParse([outcome, outcome]).success).toBe(false);
  });

  it("accepts a setup failure with no completed tests", () => {
    expect(
      recordingsSchema.parse([
        {
          project: "chromium",
          runs: 0,
          passed: 0,
          failed: 0,
          errors: ["Database unavailable"],
        },
      ]),
    ).toHaveLength(1);
  });
});
