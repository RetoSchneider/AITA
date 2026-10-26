import { describe, expect, it } from "vitest";

import { mapConcurrently } from "./concurrency.ts";

describe("mapConcurrently", () => {
  it("keeps the order of the results and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;

    const results = await mapConcurrently(
      [30, 10, 20, 5],
      2,
      async (delay, index) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, delay));
        running -= 1;
        return index;
      },
    );

    expect(results).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapConcurrently([], 3, () => Promise.resolve(1))).toEqual([]);
  });
});
