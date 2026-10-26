import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";

import { causes, confidences, severities } from "../domain/triage.ts";
import type { Verdict } from "../domain/triage.ts";
import type { ObservationLog } from "./observations.ts";
import { toInputSchema } from "./schema.ts";

export const verdictSchema = z.object({
  cause: z.enum(causes),
  confidence: z.enum(confidences),
  summary: z
    .string()
    .describe(
      "Two or three sentences on what failed and why, for a developer.",
    ),
  evidence: z.array(
    z.object({
      observation: z.string().describe("Observation id, such as O3."),
      quote: z
        .string()
        .describe("Short passage copied exactly from that observation."),
      relevance: z.string().describe("What this passage shows."),
    }),
  ),
  recommendation: z.string().describe("The next step for the team."),
  bugReport: z
    .object({
      title: z.string(),
      severity: z.enum(severities),
      steps: z.array(z.string()).describe("Steps to reproduce."),
      expected: z.string(),
      actual: z.string(),
      suspectedCause: z
        .string()
        .describe("Where in the code the defect most likely is, and why."),
    })
    .nullable()
    .describe("Required for a product-defect, null for every other cause."),
});

export type VerdictInput = z.output<typeof verdictSchema>;

export const verdictTool: BetaTool = {
  name: "submit_triage",
  description:
    "Submit the triage once the evidence supports a cause. Every quote is checked against the cited observation.",
  input_schema: toInputSchema(verdictSchema),
  strict: true,
};

export interface VerdictReview {
  verdict: Verdict;
  problems: string[];
}

export function reviewVerdict(
  input: VerdictInput,
  observations: ObservationLog,
): VerdictReview {
  const evidence = input.evidence.map((item) => ({
    ...item,
    verified: observations.contains(item.observation, item.quote),
  }));
  const unverified = evidence.flatMap((item, index) =>
    item.verified
      ? []
      : [
          `Evidence ${index + 1} does not appear in ${item.observation}. Copy the quote exactly from that observation.`,
        ],
  );
  const missingEvidence =
    input.cause !== "inconclusive" && evidence.length === 0
      ? ["Cite at least one observation as evidence."]
      : [];
  const missingReport =
    input.cause === "product-defect" && input.bugReport === null
      ? ["A product-defect needs a bug report."]
      : [];
  return {
    verdict: {
      ...input,
      evidence,
      bugReport: input.cause === "product-defect" ? input.bugReport : null,
    },
    problems: [...unverified, ...missingEvidence, ...missingReport],
  };
}
