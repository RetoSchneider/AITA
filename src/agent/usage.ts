import type { BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages";

import type { Usage } from "../domain/triage.ts";

interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const ratesPerMillionTokens: Partial<Record<string, Rates>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

export function emptyUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
  };
}

export function addUsage(total: Usage, model: string, usage: BetaUsage): Usage {
  const added = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
  const rates = ratesPerMillionTokens[model];
  return {
    inputTokens: total.inputTokens + added.inputTokens,
    outputTokens: total.outputTokens + added.outputTokens,
    cacheReadTokens: total.cacheReadTokens + added.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + added.cacheWriteTokens,
    costUsd:
      total.costUsd === null || rates === undefined
        ? null
        : total.costUsd + priceOf(added, rates),
  };
}

export function sumUsage(usages: Usage[]): Usage {
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + usage.cacheWriteTokens,
      costUsd:
        total.costUsd === null || usage.costUsd === null
          ? null
          : total.costUsd + usage.costUsd,
    }),
    emptyUsage(),
  );
}

function priceOf(usage: Omit<Usage, "costUsd">, rates: Rates): number {
  return (
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadTokens * rates.cacheRead +
      usage.cacheWriteTokens * rates.cacheWrite) /
    1_000_000
  );
}
