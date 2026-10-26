import type {
  BetaContentBlock,
  BetaMessage,
  BetaStopReason,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages";

import type { ModelGateway, ModelRequest } from "../agent/model.ts";
import type { Failure } from "../domain/failure.ts";
import type { Triage } from "../domain/triage.ts";

let sequence = 0;

export function aFailure(overrides: Partial<Failure> = {}): Failure {
  return {
    id: "tests/api/checkout.spec.ts:12 Checkout › rejects a reused key",
    kind: "test",
    title: "Checkout › rejects a reused key",
    location: { file: "tests/api/checkout.spec.ts", line: 12, column: 3 },
    failedIn: ["api"],
    flakyIn: [],
    passedIn: [],
    error: {
      message:
        "Error: expect(received).toBe(expected)\n\nExpected: 409\nReceived: 201",
    },
    attempts: [
      { project: "api", retry: 0, status: "failed", durationMs: 1200 },
    ],
    attachments: [],
    stdout: "",
    stderr: "",
    ...overrides,
  };
}

export function aTriage(overrides: Partial<Triage> = {}): Triage {
  return {
    failureId: aFailure().id,
    cause: "product-defect",
    confidence: "high",
    summary: "Checkout accepts a reused idempotency key.",
    evidence: [
      {
        observation: "O1",
        quote: "Received: 201",
        relevance: "The second checkout succeeded.",
        verified: true,
      },
    ],
    recommendation: "Compare the stored request hash before reusing an order.",
    bugReport: null,
    termination: "verdict",
    steps: [],
    toolCalls: 3,
    usage: {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.01,
    },
    durationMs: 4000,
    ...overrides,
  };
}

export function toolCall(name: string, input: unknown): BetaToolUseBlock {
  sequence += 1;
  return { type: "tool_use", id: `toolu_${sequence}`, name, input };
}

export function reply(
  content: BetaContentBlock[],
  stopReason: BetaStopReason = "tool_use",
): BetaMessage {
  return {
    id: `msg_${sequence}`,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    diagnostics: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      fallback_credit: null,
      inference_geo: null,
      iterations: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: "standard",
      speed: null,
    },
  };
}

export function textReply(text: string): BetaMessage {
  return reply([{ type: "text", text, citations: null }], "end_turn");
}

type ScriptedReply = BetaMessage | ((request: ModelRequest) => BetaMessage);

export class ScriptedGateway implements ModelGateway {
  readonly model = "claude-opus-5-5";
  readonly requests: ModelRequest[] = [];
  readonly #replies: ScriptedReply[];

  constructor(replies: ScriptedReply[]) {
    this.#replies = [...replies];
  }

  send(request: ModelRequest): Promise<BetaMessage> {
    this.requests.push(structuredClone(request));
    const next = this.#replies.shift();
    if (next === undefined) {
      return Promise.reject(new Error("No scripted reply left"));
    }
    return Promise.resolve(typeof next === "function" ? next(request) : next);
  }
}
