import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";

import { causes, confidences, severities } from "../domain/triage.ts";
import type { Verdict } from "../domain/triage.ts";
import type { ObservationLog } from "./observations.ts";
import { toInputSchema } from "./schema.ts";

const requiredText = z.string().trim().min(1);

export const verdictSchema = z.object({
  cause: z.enum(causes),
  confidence: z.enum(confidences),
  summary: requiredText.describe(
    "Two or three sentences on what failed and why, for a developer.",
  ),
  evidence: z.array(
    z.object({
      observation: requiredText.describe("Observation id, such as O3."),
      quote: requiredText.describe(
        "Short passage copied exactly from that observation.",
      ),
      relevance: requiredText.describe("What this passage shows."),
    }),
  ),
  recommendation: requiredText.describe("The next step for the team."),
  bugReport: z
    .object({
      title: requiredText,
      severity: z.enum(severities),
      steps: z.array(requiredText).min(1).describe("Steps to reproduce."),
      expected: requiredText,
      actual: requiredText,
      suspectedCause: requiredText.describe(
        "Where in the code the defect most likely is, and why.",
      ),
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
  complete: boolean;
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
          `Evidence ${index + 1} is not a verifiable quote from ${item.observation}. Copy the quote exactly from a text observation.`,
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
    complete: missingEvidence.length === 0 && missingReport.length === 0,
  };
}
