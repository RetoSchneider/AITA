import { describe, expect, it } from "vitest";

import { ObservationLog } from "./observations.ts";
import { reviewVerdict, verdictSchema } from "./verdict.ts";
import type { VerdictInput } from "./verdict.ts";

const bugReport = {
  title: "Reused idempotency key creates a second order",
  severity: "critical" as const,
  steps: [
    "Check out with key K",
    "Check out again with key K and another seat",
  ],
  expected: "409 Conflict",
  actual: "201 Created",
  suspectedCause: "The request hash is no longer compared.",
};

function verdict(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    cause: "product-defect",
    confidence: "high",
    summary: "Checkout ignores the request hash.",
    evidence: [
      {
        observation: "O1",
        quote: "Received: 201",
        relevance: "Second order created.",
      },
    ],
    recommendation: "Restore the hash comparison.",
    bugReport,
    ...overrides,
  };
}

function observations(): ObservationLog {
  const log = new ObservationLog();
  log.record("Failure report", "Expected: 409\nReceived: 201");
  return log;
}

describe("reviewVerdict", () => {
  it("accepts a grounded verdict and marks its evidence as verified", () => {
    const review = reviewVerdict(verdict(), observations());

    expect(review.problems).toEqual([]);
    expect(review.verdict.evidence[0]?.verified).toBe(true);
  });

  it("names every quote that is not in the cited observation", () => {
    const review = reviewVerdict(
      verdict({
        evidence: [
          { observation: "O1", quote: "Received: 201", relevance: "ok" },
          { observation: "O1", quote: "Received: 500", relevance: "made up" },
        ],
      }),
      observations(),
    );

    expect(review.problems).toEqual([
      "Evidence 2 is not a verifiable quote from O1. Copy the quote exactly from a text observation.",
    ]);
    expect(review.verdict.evidence.map((item) => item.verified)).toEqual([
      true,
      false,
    ]);
  });

  it("requires evidence for every cause except inconclusive", () => {
    expect(
      reviewVerdict(verdict({ evidence: [] }), observations()).problems,
    ).toContain("Cite at least one observation as evidence.");
    expect(
      reviewVerdict(
        verdict({ cause: "inconclusive", evidence: [], bugReport: null }),
        observations(),
      ).problems,
    ).toEqual([]);
  });

  it("requires a bug report for a product defect", () => {
    expect(
      reviewVerdict(verdict({ bugReport: null }), observations()).problems,
    ).toEqual(["A product-defect needs a bug report."]);
  });

  it("drops a bug report given for any other cause", () => {
    const review = reviewVerdict(
      verdict({ cause: "flaky-test" }),
      observations(),
    );

    expect(review.verdict.bugReport).toBeNull();
  });

  it.each([
    { summary: "   " },
    { recommendation: "" },
    { bugReport: { ...bugReport, steps: [] } },
    { bugReport: { ...bugReport, expected: "  " } },
    {
      evidence: [{ observation: "O1", quote: "Received: 201", relevance: "" }],
    },
  ])("rejects blank verdict content: %j", (overrides) => {
    expect(verdictSchema.safeParse(verdict(overrides)).success).toBe(false);
  });
});
