import { sumUsage } from "../agent/usage.ts";
import type { Failure } from "../domain/failure.ts";
import type { BugReport, Cause, Evidence, Triage } from "../domain/triage.ts";
import { plural } from "../shared/text.ts";
import type { TriageEntry, TriageRun } from "../triage-run.ts";
import { codeSpan, escapeCell, escapeHtml, escapeText } from "./escaping.ts";
import {
  causeLabels,
  formatCost,
  formatDuration,
  formatTokens,
} from "./labels.ts";

export function renderRun(run: TriageRun): string {
  const triages = run.entries.map((entry) => entry.triage);
  return [
    "## Test triage",
    "",
    headline(triages),
    ...(run.entries.length > 0 ? ["", ...overview(run.entries)] : []),
    ...run.entries.flatMap((entry) => ["", ...section(entry)]),
    ...(run.skipped.length > 0
      ? [
          "",
          `${plural(run.skipped.length, "more failure")} not triaged: ${run.skipped.map((failure) => escapeText(locate(failure))).join(", ")}`,
        ]
      : []),
    "",
    "---",
    footer(run.model, triages),
  ].join("\n");
}

function headline(triages: Triage[]): string {
  if (triages.length === 0) return "No failed or flaky tests.";
  const counts = new Map<Cause, number>();
  for (const triage of triages) {
    counts.set(triage.cause, (counts.get(triage.cause) ?? 0) + 1);
  }
  const parts = [...counts].map(
    ([cause, count]) => `${count} × ${causeLabels[cause].toLowerCase()}`,
  );
  return `${plural(triages.length, "failure")} triaged: ${parts.join(", ")}.`;
}

function overview(entries: TriageEntry[]): string[] {
  return [
    "| Test | Cause | Confidence |",
    "| --- | --- | --- |",
    ...entries.map(
      ({ failure, triage }) =>
        `| ${escapeCell(failure.title)} | ${causeLabels[triage.cause]} | ${triage.confidence} |`,
    ),
  ];
}

function section({ failure, triage }: TriageEntry): string[] {
  return [
    `### ${causeLabels[triage.cause]}: ${escapeCell(failure.title)}`,
    "",
    `${codeSpan(locate(failure))} · ${escapeText(scope(failure))} · ${triage.confidence} confidence`,
    "",
    escapeText(triage.summary),
    ...evidence(triage.evidence),
    ...(triage.bugReport === null ? [] : bugReport(triage.bugReport)),
    "",
    `**Next step:** ${escapeText(triage.recommendation)}`,
  ];
}

function evidence(items: Evidence[]): string[] {
  if (items.length === 0) return [];
  return [
    "",
    "**Evidence**",
    "",
    ...items.flatMap((item) => [
      `- ${escapeText(item.relevance)}${item.verified ? "" : " _(quote not found in the cited observation)_"}`,
      ...item.quote.split(/\r?\n/).map((line) => `  > ${escapeText(line)}`),
    ]),
  ];
}

function bugReport(report: BugReport): string[] {
  return [
    "",
    `**Bug report: ${escapeCell(report.title)}** (${report.severity})`,
    "",
    ...report.steps.map((step, index) => `${index + 1}. ${escapeCell(step)}`),
    "",
    `- **Expected:** ${escapeText(report.expected)}`,
    `- **Actual:** ${escapeText(report.actual)}`,
    `- **Suspected cause:** ${escapeText(report.suspectedCause)}`,
  ];
}

function footer(model: string, triages: Triage[]): string {
  const usage = sumUsage(triages.map((triage) => triage.usage));
  const toolCalls = triages.reduce(
    (total, triage) => total + triage.toolCalls,
    0,
  );
  const duration = triages.reduce(
    (total, triage) => total + triage.durationMs,
    0,
  );
  return `<sub>${escapeHtml(model)} · ${plural(toolCalls, "tool call")} · ${formatTokens(usage)} · ${formatCost(usage.costUsd)} · ${formatDuration(duration)} agent time</sub>`;
}

function locate(failure: Failure): string {
  return failure.kind === "setup"
    ? failure.title
    : `${failure.location.file}:${failure.location.line}`;
}

function scope(failure: Failure): string {
  if (failure.kind === "setup") return "before the tests ran";
  const failed =
    failure.failedIn.length > 0
      ? [`failed in ${failure.failedIn.join(", ")}`]
      : [];
  const flaky =
    failure.flakyIn.length > 0
      ? [`passed on retry in ${failure.flakyIn.join(", ")}`]
      : [];
  return [...failed, ...flaky].join(", ");
}
