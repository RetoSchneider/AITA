import { describe, expect, it } from "vitest";

import { reply } from "../testing/builders.ts";
import { addUsage, emptyUsage, sumUsage } from "./usage.ts";

describe("usage", () => {
  it("adds tokens and prices them with the rates of the serving model", () => {
    const usage = addUsage(emptyUsage(), "claude-opus-5-5", reply([]).usage);

    expect(usage).toEqual({
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
      costUsd: (1000 * 4 + 100 * 20 + 500 * 0.2) / 1_000_000,
    });
  });

  it("reports the cost as unknown once a model without rates served a turn", () => {
    const known = addUsage(emptyUsage(), "claude-opus-5-5", reply([]).usage);

    expect(
      addUsage(known, "claude-unknown", reply([]).usage).costUsd,
    ).toBeNull();
  });

  it("sums the usage of several triages", () => {
    const one = addUsage(emptyUsage(), "claude-opus-5-5", reply([]).usage);

    expect(sumUsage([one, one])).toEqual({
      inputTokens: 2000,
      outputTokens: 200,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      costUsd: (one.costUsd ?? 0) * 2,
    });
  });
});
