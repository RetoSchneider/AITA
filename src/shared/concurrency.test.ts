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

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects an invalid concurrency limit of %s",
    async (limit) => {
      await expect(
        mapConcurrently([1], limit, (item) => Promise.resolve(item)),
      ).rejects.toThrow("Concurrency must be a positive safe integer");
    },
  );

  it("stops scheduling after a failure and waits for active tasks to finish", async () => {
    let finish: () => void = () => undefined;
    const active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const started: number[] = [];
    const failure = new Error("First task failed");
    let completed = false;
    let settled = false;
    const result = mapConcurrently([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      if (item === 0) throw failure;
      await active;
      completed = true;
      return item;
    }).catch((error: unknown) => {
      settled = true;
      return error;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(settled).toBe(false);

    finish();
    expect(await result).toBe(failure);
    expect(completed).toBe(true);
    expect(started).toEqual([0, 1]);
  });
});
