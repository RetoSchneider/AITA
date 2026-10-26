import { describe, expect, it } from "vitest";

import type { Cause } from "../domain/triage.ts";
import { aTriage } from "../testing/builders.ts";
import type { ExpectedCause } from "./cases.ts";
import { renderScorecard } from "./scorecard.ts";
import { score } from "./scoring.ts";
import type { CaseRun } from "./scoring.ts";

function run(
  caseId: string,
  expected: ExpectedCause,
  actual: Cause,
  repetition = 1,
  verified = true,
): CaseRun {
  return {
    caseId,
    title: `Case ${caseId}`,
    expected,
    repetition,
    triage: aTriage({
      cause: actual,
      evidence: [{ observation: "O1", quote: "q", relevance: "r", verified }],
    }),
  };
}

const runs = [
  run("a", "product-defect", "product-defect", 1),
  run("a", "product-defect", "product-defect", 2),
  run("b", "flaky-test", "flaky-test", 1),
  run("b", "flaky-test", "environment-issue", 2, false),
  run("c", "outdated-test", "inconclusive", 1),
  run("c", "outdated-test", "outdated-test", 2),
];

describe("score", () => {
  it("separates accuracy from abstention", () => {
    const scorecard = score(runs);

    expect(scorecard.correct).toEqual({ count: 4, total: 6 });
    expect(scorecard.answered).toEqual({ count: 5, total: 6 });
    expect(scorecard.correctWhenAnswered).toEqual({ count: 4, total: 5 });
  });

  it("counts a case as consistent only when every run agrees", () => {
    expect(score(runs).consistent).toEqual({ count: 1, total: 3 });
  });

  it("measures how much evidence was verified", () => {
    expect(score(runs).verifiedEvidence).toEqual({ count: 5, total: 6 });
  });

  it("scores every expected cause and builds the confusion matrix", () => {
    const scorecard = score(runs);

    expect(scorecard.byCause).toEqual([
      { cause: "product-defect", correct: { count: 2, total: 2 } },
      { cause: "outdated-test", correct: { count: 1, total: 2 } },
      { cause: "flaky-test", correct: { count: 1, total: 2 } },
    ]);
    expect(scorecard.confusion.get("flaky-test")).toEqual(
      new Map([
        ["flaky-test", 1],
        ["environment-issue", 1],
      ]),
    );
  });

  it("averages tool calls and duration and sums the cost", () => {
    const scorecard = score(runs);

    expect(scorecard.meanToolCalls).toBe(3);
    expect(scorecard.meanDurationMs).toBe(4000);
    expect(scorecard.usage.costUsd).toBeCloseTo(0.06);
  });
});

describe("renderScorecard", () => {
  it("reports the headline metrics, the matrix and every case", () => {
    const markdown = renderScorecard(score(runs), runs, {
      model: "claude-opus-5-5",
      effort: "high",
      repository: "https://github.com/RetoSchneider/SeatWise.git",
      revision: "f9313a6c0ffee",
      date: "2026-10-26",
    });

    expect(markdown).toContain(
      "3 cases × 2 runs against https://github.com/RetoSchneider/SeatWise.git at `f9313a6`",
    );
    expect(markdown).toContain("| Correct cause | 4 of 6 (67 %) |");
    expect(markdown).toContain(
      "| Same cause in every run | 1 of 3 (33 %) cases |",
    );
    expect(markdown).toContain("| Flaky test | 0 | 0 | 1 | 1 | 0 |");
    expect(markdown).toContain(
      "| Case b | Flaky test | ✓ Flaky test, ✗ Environment issue | 1 of 2 | 3, 3 |",
    );
  });

  it("keeps case titles inside one literal table cell", () => {
    const cases = [
      {
        ...run("escaped-title", "product-defect", "product-defect"),
        title: "Broken | <img src=x>\n[link](https://example.com)",
      },
    ];
    const markdown = renderScorecard(score(cases), cases, {
      model: "model",
      effort: "high",
      repository: "repository",
      revision: "abc1234",
      date: "2026-10-26",
    });

    expect(markdown).toContain(
      "| Broken \\| &lt;img src=x&gt; \\[link\\]\\(https://example.com\\) | Product defect |",
    );
    expect(markdown).not.toContain("<img");
  });
});
