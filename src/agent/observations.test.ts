import { describe, expect, it } from "vitest";

import { ObservationLog, render } from "./observations.ts";

describe("ObservationLog", () => {
  it("numbers observations in the order they are recorded", () => {
    const log = new ObservationLog();

    expect(log.record("Failure report", "a").id).toBe("O1");
    expect(log.record("read_file a.ts:1-2", "b").id).toBe("O2");
  });

  it("accepts quotes that differ only in whitespace", () => {
    const log = new ObservationLog();
    const observation = log.record("error", "Expected: 409\n  Received:   201");

    expect(log.contains(observation.id, "Expected: 409 Received: 201")).toBe(
      true,
    );
  });

  it("accepts code quoted without the line numbers of read_file", () => {
    const log = new ObservationLog();
    const observation = log.record(
      "read_file src/checkout.ts:10-11",
      "src/checkout.ts, lines 10-11 of 40\n10 |   if (existing) {\n11 |     return existing;",
    );

    expect(
      log.contains(observation.id, "if (existing) {\n    return existing;"),
    ).toBe(true);
  });

  it("rejects quotes from another observation, unknown ids and empty quotes", () => {
    const log = new ObservationLog();
    log.record("first", "status 409");
    log.record("second", "status 201");

    expect(log.contains("O2", "status 409")).toBe(false);
    expect(log.contains("O9", "status 409")).toBe(false);
    expect(log.contains("O1", "   ")).toBe(false);
  });

  it("does not verify the descriptive text accompanying an image", () => {
    const log = new ObservationLog();
    const image = log.record(
      "Screenshot",
      "Image image/png, shown below.",
      "image",
    );

    expect(log.contains(image.id, "Image image/png")).toBe(false);
  });

  it("renders an observation with its id and label", () => {
    expect(
      render({ id: "O3", label: "list_changes", text: "none", kind: "text" }),
    ).toBe("[O3] list_changes\nnone");
  });
});
