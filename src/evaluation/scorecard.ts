import { causes } from "../domain/triage.ts";
import { codeSpan, escapeCell, escapeText } from "../output/escaping.ts";
import {
  causeLabels,
  formatCost,
  formatDuration,
  formatPercent,
  formatTokens,
} from "../output/labels.ts";
import type { CaseRun, Ratio, Scorecard } from "./scoring.ts";
import { share } from "./scoring.ts";

export interface ScorecardContext {
  model: string;
  effort: string;
  repository: string;
  revision: string;
  date: string;
}

export function renderScorecard(
  scorecard: Scorecard,
  runs: CaseRun[],
  context: ScorecardContext,
): string {
  const repetitions =
    scorecard.cases === 0 ? 0 : scorecard.runs / scorecard.cases;
  return [
    `# Evaluation: ${escapeCell(context.model)}, ${escapeCell(context.effort)} effort`,
    "",
    `${scorecard.cases} cases × ${repetitions} ${repetitions === 1 ? "run" : "runs"} against ${escapeText(context.repository)} at ${codeSpan(context.revision.slice(0, 7))} on ${escapeCell(context.date)}.`,
    "",
    "| Metric | Result |",
    "| --- | --- |",
    `| Correct cause | ${fraction(scorecard.correct)} |`,
    `| Answered, not inconclusive | ${fraction(scorecard.answered)} |`,
    `| Correct when answered | ${fraction(scorecard.correctWhenAnswered)} |`,
    ...(repetitions > 1
      ? [
          `| Same cause in every run | ${fraction(scorecard.consistent)} cases |`,
        ]
      : []),
    `| Evidence quotes verified | ${fraction(scorecard.verifiedEvidence)} |`,
    `| Tool calls per triage | ${scorecard.meanToolCalls.toFixed(1)} |`,
    `| Time per triage | ${formatDuration(scorecard.meanDurationMs)} |`,
    `| Tokens | ${formatTokens(scorecard.usage)} |`,
    `| Cost | ${formatCost(scorecard.usage.costUsd)} in total, ${formatCost(perRun(scorecard))} per triage |`,
    "",
    "## By cause",
    "",
    "| Expected cause | Correct |",
    "| --- | --- |",
    ...scorecard.byCause.map(
      ({ cause, correct }) =>
        `| ${causeLabels[cause]} | ${fraction(correct)} |`,
    ),
    "",
    "## Confusion matrix",
    "",
    `| Expected ↓ / verdict → | ${causes.map((cause) => causeLabels[cause]).join(" | ")} |`,
    `| --- | ${causes.map(() => "---").join(" | ")} |`,
    ...[...scorecard.confusion].map(
      ([expected, row]) =>
        `| ${causeLabels[expected]} | ${causes.map((cause) => row.get(cause) ?? 0).join(" | ")} |`,
    ),
    "",
    "## Cases",
    "",
    "| Case | Expected | Verdicts | Verified evidence | Tool calls |",
    "| --- | --- | --- | --- | --- |",
    ...caseRows(runs),
  ].join("\n");
}

function caseRows(runs: CaseRun[]): string[] {
  const ids = [...new Set(runs.map((run) => run.caseId))];
  return ids.map((id) => {
    const ofCase = runs.filter((run) => run.caseId === id);
    const first = ofCase[0];
    if (first === undefined) return "";
    const verdicts = ofCase
      .map(
        (run) =>
          `${run.triage.cause === run.expected ? "✓" : "✗"} ${causeLabels[run.triage.cause]}`,
      )
      .join(", ");
    const evidence = ofCase.flatMap((run) => run.triage.evidence);
    const verified = evidence.filter((item) => item.verified).length;
    const toolCalls = ofCase.map((run) => run.triage.toolCalls).join(", ");
    return `| ${escapeCell(first.title)} | ${causeLabels[first.expected]} | ${verdicts} | ${verified} of ${evidence.length} | ${toolCalls} |`;
  });
}

function fraction(value: Ratio): string {
  return `${value.count} of ${value.total} (${formatPercent(share(value))})`;
}

function perRun(scorecard: Scorecard): number | null {
  const { costUsd } = scorecard.usage;
  return costUsd === null || scorecard.runs === 0
    ? null
    : costUsd / scorecard.runs;
}
