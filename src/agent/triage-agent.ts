import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";

import type { Failure } from "../domain/failure.ts";
import type {
  Step,
  Termination,
  Triage,
  Usage,
  Verdict,
} from "../domain/triage.ts";
import { clip, messageOf } from "../shared/text.ts";
import type { Workspace } from "../workspace/workspace.ts";
import { describeFailure } from "./briefing.ts";
import { budgetNotice, instructions, verdictReminder } from "./instructions.ts";
import type { ModelGateway } from "./model.ts";
import { ObservationLog, render } from "./observations.ts";
import { createTools } from "./tools.ts";
import type { ExecutableTool, ToolOutput } from "./tools.ts";
import { addUsage, emptyUsage } from "./usage.ts";
import { reviewVerdict, verdictSchema, verdictTool } from "./verdict.ts";

export interface AgentLimits {
  maxToolCalls: number;
  maxRejectedVerdicts: number;
  maxObservationLength: number;
}

export const defaultLimits: AgentLimits = {
  maxToolCalls: 16,
  maxRejectedVerdicts: 2,
  maxObservationLength: 24_000,
};

export class TriageAgent {
  readonly #gateway: ModelGateway;
  readonly #limits: AgentLimits;

  constructor(gateway: ModelGateway, limits: Partial<AgentLimits> = {}) {
    this.#gateway = gateway;
    this.#limits = { ...defaultLimits, ...limits };
  }

  get model(): string {
    return this.#gateway.model;
  }

  triage(failure: Failure, workspace: Workspace): Promise<Triage> {
    return new Investigation(
      this.#gateway,
      this.#limits,
      failure,
      workspace,
    ).run();
  }
}

type Review =
  | { accepted: true; verdict: Verdict }
  | { accepted: false; feedback: string; exhausted: boolean };

type TurnOutcome =
  { termination: "verdict"; verdict: Verdict } | { termination: "no-verdict" };

type ToolOutcome = { call: BetaToolUseBlock } & (
  { succeeded: true; output: ToolOutput } | { succeeded: false; error: string }
);

const unanswered: Record<Exclude<Termination, "verdict">, string> = {
  "limit-reached":
    "The investigation used its tool budget without reaching a verdict.",
  refusal: "The model declined to triage this failure.",
  "token-limit": "The response hit the output limit before a verdict.",
  "no-verdict": "The investigation ended without a verdict.",
};

class Investigation {
  readonly #gateway: ModelGateway;
  readonly #limits: AgentLimits;
  readonly #failure: Failure;
  readonly #workspace: Workspace;
  readonly #tools: ExecutableTool[];
  readonly #system: string;
  readonly #observations = new ObservationLog();
  readonly #messages: BetaMessageParam[] = [];
  readonly #steps: Step[] = [];
  readonly #startedAt = performance.now();
  #usage: Usage = emptyUsage();
  #toolCalls = 0;
  #rejectedVerdicts = 0;
  #budgetAnnounced = false;

  constructor(
    gateway: ModelGateway,
    limits: AgentLimits,
    failure: Failure,
    workspace: Workspace,
  ) {
    this.#gateway = gateway;
    this.#limits = limits;
    this.#failure = failure;
    this.#workspace = workspace;
    const canRerun = workspace.runner !== undefined && failure.kind === "test";
    this.#tools = createTools({ rerun: canRerun });
    this.#system = instructions({
      maxToolCalls: limits.maxToolCalls,
      canRerun,
    });
  }

  async run(): Promise<Triage> {
    const report = this.#observations.record(
      "Failure report",
      clip(describeFailure(this.#failure), this.#limits.maxObservationLength),
    );
    this.#messages.push({ role: "user", content: [text(render(report))] });
    let reminded = false;
    const maxTurns =
      this.#limits.maxToolCalls + this.#limits.maxRejectedVerdicts + 3;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const response = await this.#gateway.send({
        system: this.#system,
        tools: [...this.#tools.map((tool) => tool.definition), verdictTool],
        messages: this.#messages,
      });
      this.#usage = addUsage(this.#usage, response.model, response.usage);
      this.#messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") return this.#giveUp("refusal");
      if (response.stop_reason === "max_tokens") {
        return this.#giveUp("token-limit");
      }

      const calls = response.content.filter(
        (block): block is BetaToolUseBlock => block.type === "tool_use",
      );
      if (calls.length === 0) {
        if (reminded) return this.#giveUp("no-verdict");
        reminded = true;
        this.#messages.push({ role: "user", content: [text(verdictReminder)] });
        continue;
      }

      const outcome = await this.#answer(calls);
      if (outcome?.termination === "verdict") {
        return this.#conclude("verdict", outcome.verdict);
      }
      if (outcome?.termination === "no-verdict") {
        return this.#giveUp("no-verdict");
      }
    }
    return this.#giveUp("limit-reached");
  }

  async #answer(calls: BetaToolUseBlock[]): Promise<TurnOutcome | undefined> {
    const results: BetaToolResultBlockParam[] = [];
    for (const call of calls.filter((call) => call.name === verdictTool.name)) {
      const review = this.#review(call);
      if (review.accepted) {
        return { termination: "verdict", verdict: review.verdict };
      }
      if (review.exhausted) return { termination: "no-verdict" };
      results.push(failed(call.id, review.feedback));
    }
    const actions = calls.filter((call) => call.name !== verdictTool.name);
    const outcomes = await Promise.all(actions.map((call) => this.#run(call)));
    results.push(...outcomes.map((outcome) => this.#record(outcome)));

    const content: BetaContentBlockParam[] = [...results];
    if (
      this.#toolCalls >= this.#limits.maxToolCalls &&
      !this.#budgetAnnounced
    ) {
      this.#budgetAnnounced = true;
      content.push(text(budgetNotice));
    }
    this.#messages.push({ role: "user", content });
    return undefined;
  }

  #review(call: BetaToolUseBlock): Review {
    const parsed = verdictSchema.safeParse(call.input);
    if (!parsed.success) return this.#reject(z.prettifyError(parsed.error));
    const { verdict, problems, complete } = reviewVerdict(
      parsed.data,
      this.#observations,
    );
    const exhausted =
      this.#rejectedVerdicts >= this.#limits.maxRejectedVerdicts;
    if (problems.length === 0 || (exhausted && complete)) {
      return { accepted: true, verdict };
    }
    return this.#reject(problems.join("\n"));
  }

  #reject(feedback: string): Review {
    const exhausted =
      this.#rejectedVerdicts >= this.#limits.maxRejectedVerdicts;
    this.#rejectedVerdicts += 1;
    this.#steps.push({
      action: verdictTool.name,
      observation: null,
      error: feedback,
    });
    return { accepted: false, feedback, exhausted };
  }

  async #run(call: BetaToolUseBlock): Promise<ToolOutcome> {
    if (this.#toolCalls >= this.#limits.maxToolCalls) {
      return { call, succeeded: false, error: budgetNotice };
    }
    this.#toolCalls += 1;
    const tool = this.#tools.find((candidate) => candidate.name === call.name);
    if (tool === undefined) {
      return {
        call,
        succeeded: false,
        error: `There is no tool named ${call.name}.`,
      };
    }
    try {
      const output = await tool.run(call.input, {
        failure: this.#failure,
        workspace: this.#workspace,
      });
      return { call, succeeded: true, output };
    } catch (error) {
      return { call, succeeded: false, error: messageOf(error) };
    }
  }

  #record(outcome: ToolOutcome): BetaToolResultBlockParam {
    const { call } = outcome;
    if (!outcome.succeeded) {
      this.#steps.push({
        action: `${call.name} ${JSON.stringify(call.input)}`,
        observation: null,
        error: outcome.error,
      });
      return failed(call.id, outcome.error);
    }
    const { output } = outcome;
    const observation = this.#observations.record(
      output.label,
      output.kind === "text"
        ? clip(output.text, this.#limits.maxObservationLength)
        : `Image ${output.mediaType}, shown below. Images cannot be quoted as evidence.`,
      output.kind,
    );
    this.#steps.push({
      action: output.label,
      observation: observation.id,
      error: null,
    });
    return {
      type: "tool_result",
      tool_use_id: call.id,
      content: [
        text(render(observation)),
        ...(output.kind === "image"
          ? [
              {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: output.mediaType,
                  data: output.data,
                },
              },
            ]
          : []),
      ],
    };
  }

  #giveUp(termination: Exclude<Termination, "verdict">): Triage {
    return this.#conclude(termination, {
      cause: "inconclusive",
      confidence: "low",
      summary: unanswered[termination],
      evidence: [],
      recommendation: "Investigate this failure manually.",
      bugReport: null,
    });
  }

  #conclude(termination: Termination, verdict: Verdict): Triage {
    return {
      failureId: this.#failure.id,
      ...verdict,
      termination,
      steps: this.#steps,
      toolCalls: this.#toolCalls,
      usage: this.#usage,
      durationMs: Math.round(performance.now() - this.#startedAt),
    };
  }
}

function text(value: string): { type: "text"; text: string } {
  return { type: "text", text: value };
}

function failed(id: string, message: string): BetaToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: id,
    is_error: true,
    content: message,
  };
}
