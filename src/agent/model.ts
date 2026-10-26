import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages";

export const efforts = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof efforts)[number];

export const defaultModel = "claude-opus-5-5";

const modelsWithServerFallback = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

export interface ModelRequest {
  system: string;
  tools: BetaTool[];
  messages: BetaMessageParam[];
}

export interface ModelGateway {
  readonly model: string;
  send(request: ModelRequest): Promise<BetaMessage>;
}

export function describeModelError(error: unknown): string | undefined {
  if (!(error instanceof Anthropic.APIError)) return undefined;
  const body: unknown = error.error;
  const detail =
    isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.message === "string"
      ? body.error.message
      : error.message;
  return `Claude API error${error.status === undefined ? "" : ` ${String(error.status)}`}: ${detail}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class AnthropicGateway implements ModelGateway {
  readonly model: string;
  readonly #effort: Effort;
  readonly #client: Anthropic;

  constructor(options: { model: string; effort: Effort; client?: Anthropic }) {
    this.model = options.model;
    this.#effort = options.effort;
    this.#client = options.client ?? new Anthropic();
  }

  send(request: ModelRequest): Promise<BetaMessage> {
    return this.#client.beta.messages.create({
      model: this.model,
      max_tokens: 16_000,
      thinking: { type: "adaptive" },
      output_config: { effort: this.#effort },
      cache_control: { type: "ephemeral" },
      system: request.system,
      tools: request.tools,
      messages: request.messages,
      ...(modelsWithServerFallback.has(this.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
        : {}),
    });
  }
}
