import { sumUsage } from "../agent/usage.ts";
import type { Cause, Triage, Usage } from "../domain/triage.ts";
import type { ExpectedCause } from "./cases.ts";
import { expectedCauses } from "./cases.ts";

export interface CaseRun {
  caseId: string;
  title: string;
  expected: ExpectedCause;
  repetition: number;
  triage: Triage;
}

export interface Ratio {
  count: number;
  total: number;
}

export interface CauseScore {
  cause: ExpectedCause;
  correct: Ratio;
}

export interface Scorecard {
  cases: number;
  runs: number;
  correct: Ratio;
  answered: Ratio;
  correctWhenAnswered: Ratio;
  consistent: Ratio;
  verifiedEvidence: Ratio;
  byCause: CauseScore[];
  confusion: Map<ExpectedCause, Map<Cause, number>>;
  usage: Usage;
  meanToolCalls: number;
  meanDurationMs: number;
}

export function score(runs: CaseRun[]): Scorecard {
  const caseIds = [...new Set(runs.map((run) => run.caseId))];
  const answered = runs.filter((run) => run.triage.cause !== "inconclusive");
  const evidence = runs.flatMap((run) => run.triage.evidence);
  return {
    cases: caseIds.length,
    runs: runs.length,
    correct: ratio(runs.filter(isCorrect).length, runs.length),
    answered: ratio(answered.length, runs.length),
    correctWhenAnswered: ratio(
      answered.filter(isCorrect).length,
      answered.length,
    ),
    consistent: ratio(
      caseIds.filter(
        (id) =>
          new Set(
            runs
              .filter((run) => run.caseId === id)
              .map((run) => run.triage.cause),
          ).size === 1,
      ).length,
      caseIds.length,
    ),
    verifiedEvidence: ratio(
      evidence.filter((item) => item.verified).length,
      evidence.length,
    ),
    byCause: expectedCauses
      .map((cause) => {
        const ofCause = runs.filter((run) => run.expected === cause);
        return {
          cause,
          correct: ratio(ofCause.filter(isCorrect).length, ofCause.length),
        };
      })
      .filter((item) => item.correct.total > 0),
    confusion: confusionOf(runs),
    usage: sumUsage(runs.map((run) => run.triage.usage)),
    meanToolCalls: mean(runs.map((run) => run.triage.toolCalls)),
    meanDurationMs: mean(runs.map((run) => run.triage.durationMs)),
  };
}

export function share({ count, total }: Ratio): number {
  return total === 0 ? 0 : count / total;
}

function isCorrect(run: CaseRun): boolean {
  return run.triage.cause === run.expected;
}

function confusionOf(runs: CaseRun[]): Map<ExpectedCause, Map<Cause, number>> {
  const matrix = new Map<ExpectedCause, Map<Cause, number>>();
  for (const run of runs) {
    const row = matrix.get(run.expected) ?? new Map<Cause, number>();
    row.set(run.triage.cause, (row.get(run.triage.cause) ?? 0) + 1);
    matrix.set(run.expected, row);
  }
  return matrix;
}

function ratio(count: number, total: number): Ratio {
  return { count, total };
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}
