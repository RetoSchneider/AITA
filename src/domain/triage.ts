export const causes = [
  "product-defect",
  "outdated-test",
  "flaky-test",
  "environment-issue",
  "inconclusive",
] as const;
export type Cause = (typeof causes)[number];

export const confidences = ["low", "medium", "high"] as const;
export type Confidence = (typeof confidences)[number];

export const severities = ["critical", "major", "minor"] as const;
export type Severity = (typeof severities)[number];

export interface Evidence {
  observation: string;
  quote: string;
  relevance: string;
  verified: boolean;
}

export interface BugReport {
  title: string;
  severity: Severity;
  steps: string[];
  expected: string;
  actual: string;
  suspectedCause: string;
}

export interface Verdict {
  cause: Cause;
  confidence: Confidence;
  summary: string;
  evidence: Evidence[];
  recommendation: string;
  bugReport: BugReport | null;
}

export type Termination =
  "verdict" | "limit-reached" | "refusal" | "token-limit" | "no-verdict";

export interface Step {
  action: string;
  observation: string | null;
  error: string | null;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
}

export interface Triage extends Verdict {
  failureId: string;
  termination: Termination;
  steps: Step[];
  toolCalls: number;
  usage: Usage;
  durationMs: number;
}
