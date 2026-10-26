import type { Cause, Usage } from "../domain/triage.ts";

export const causeLabels: Record<Cause, string> = {
  "product-defect": "Product defect",
  "outdated-test": "Outdated test",
  "flaky-test": "Flaky test",
  "environment-issue": "Environment issue",
  inconclusive: "Inconclusive",
};

export function formatTokens(usage: Usage): string {
  const input =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  return `${compact(input)} input and ${compact(usage.outputTokens)} output tokens`;
}

export function formatCost(costUsd: number | null): string {
  return costUsd === null ? "cost unknown" : `$${costUsd.toFixed(2)}`;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

function compact(count: number): string {
  return count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`;
}
