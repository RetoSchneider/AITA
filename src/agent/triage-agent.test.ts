import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RerunOutcome, TestRunner } from "../playwright/runner.ts";
import {
  aFailure,
  reply,
  ScriptedGateway,
  textReply,
  toolCall,
} from "../testing/builders.ts";
import { temporaryRepository } from "../testing/git-repository.ts";
import type { TemporaryRepository } from "../testing/git-repository.ts";
import { ArtifactStore } from "../workspace/artifacts.ts";
import { Repository } from "../workspace/repository.ts";
import type { Workspace } from "../workspace/workspace.ts";
import { budgetNotice, verdictReminder } from "./instructions.ts";
import { TriageAgent } from "./triage-agent.ts";

let fixture: TemporaryRepository;
let workspace: Workspace;

beforeAll(async () => {
  fixture = await temporaryRepository();
  const baseline = await fixture.commit(
    {
      "src/checkout.ts": "if (order.hash !== hash) {\n  throw conflict();\n}\n",
    },
    "Add checkout",
  );
  await fixture.commit(
    { "src/checkout.ts": "return existingOrder;\n" },
    "Simplify idempotent checkout",
  );
  workspace = {
    repository: new Repository(fixture.root, baseline),
    artifacts: new ArtifactStore(fixture.root),
    runner: undefined,
  };
});

afterAll(async () => {
  await fixture.remove();
});

const readCheckout = () =>
  toolCall("read_file", { path: "src/checkout.ts", startLine: 1, endLine: 5 });

function submit(quote: string, observation = "O2") {
  return toolCall("submit_triage", {
    cause: "product-defect",
    confidence: "high",
    summary:
      "Checkout returns the existing order without comparing the request hash.",
    evidence: [{ observation, quote, relevance: "The hash check is gone." }],
    recommendation: "Restore the hash comparison.",
    bugReport: {
      title: "A reused idempotency key returns another order",
      severity: "critical",
      steps: ["Check out with key K", "Check out with key K and other seats"],
      expected: "409 Conflict",
      actual: "201 Created",
      suspectedCause:
        "src/checkout.ts returns the existing order unconditionally.",
    },
  });
}

function lastUserContent(
  messages: BetaMessageParam[],
): BetaContentBlockParam[] {
  const last = messages.at(-1);
  if (last?.role !== "user" || typeof last.content === "string") {
    throw new Error("The last message is not a user message with blocks");
  }
  return last.content;
}

function toolResults(messages: BetaMessageParam[]): BetaToolResultBlockParam[] {
  return lastUserContent(messages).filter(
    (block): block is BetaToolResultBlockParam => block.type === "tool_result",
  );
}

function textOf(result: BetaToolResultBlockParam | undefined): string {
  const content = result?.content;
  if (typeof content === "string") return content;
  return (content ?? [])
    .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
    .join("\n");
}

describe("TriageAgent", () => {
  it("investigates with tools and returns a grounded verdict", async () => {
    const gateway = new ScriptedGateway([
      reply([readCheckout(), toolCall("list_changes", {})]),
      reply([submit("return existingOrder;")]),
    ]);

    const triage = await new TriageAgent(gateway).triage(aFailure(), workspace);

    expect(triage).toMatchObject({
      cause: "product-defect",
      termination: "verdict",
      toolCalls: 2,
      evidence: [{ observation: "O2", verified: true }],
    });
    expect(triage.steps.map((step) => step.action)).toEqual([
      "read_file src/checkout.ts:1-5",
      "list_changes",
    ]);
    expect(triage.usage.inputTokens).toBe(2000);
    const [read, changes] = toolResults(gateway.requests[1]?.messages ?? []);
    expect(textOf(read)).toMatch(/^\[O2\] read_file src\/checkout.ts:1-5/);
    expect(textOf(changes)).toContain("Simplify idempotent checkout");
  });

  it("starts from the failure report as the first observation", async () => {
    const gateway = new ScriptedGateway([
      reply([submit("Received: 201", "O1")]),
    ]);

    await new TriageAgent(gateway).triage(aFailure(), workspace);

    const first = gateway.requests[0]?.messages[0];
    expect(JSON.stringify(first?.content)).toContain(
      "[O1] Failure report\\nTest: Checkout › rejects a reused key",
    );
  });

  it("returns a quote that is not in the cited observation to the model", async () => {
    const gateway = new ScriptedGateway([
      reply([readCheckout()]),
      reply([submit("return order;")]),
      reply([submit("return existingOrder;")]),
    ]);

    const triage = await new TriageAgent(gateway).triage(aFailure(), workspace);

    expect(triage.evidence[0]?.verified).toBe(true);
    const [rejection] = toolResults(gateway.requests[2]?.messages ?? []);
    expect(rejection?.is_error).toBe(true);
    expect(textOf(rejection)).toBe(
      "Evidence 1 does not appear in O2. Copy the quote exactly from that observation.",
    );
    expect(triage.steps.at(-1)).toMatchObject({ action: "submit_triage" });
  });

  it("accepts the verdict after the allowed rejections and flags the unverified quote", async () => {
    const gateway = new ScriptedGateway([
      reply([submit("invented", "O1")]),
      reply([submit("still invented", "O1")]),
    ]);

    const triage = await new TriageAgent(gateway, {
      maxRejectedVerdicts: 1,
    }).triage(aFailure(), workspace);

    expect(triage).toMatchObject({
      termination: "verdict",
      evidence: [{ quote: "still invented", verified: false }],
    });
  });

  it("announces the exhausted tool budget once and refuses further tool calls", async () => {
    const gateway = new ScriptedGateway([
      reply([readCheckout()]),
      reply([toolCall("search_code", { pattern: "hash", ignoreCase: false })]),
      reply([submit("return existingOrder;")]),
    ]);

    const triage = await new TriageAgent(gateway, { maxToolCalls: 1 }).triage(
      aFailure(),
      workspace,
    );

    expect(lastUserContent(gateway.requests[1]?.messages ?? []).at(-1)).toEqual(
      {
        type: "text",
        text: budgetNotice,
      },
    );
    const [refused] = toolResults(gateway.requests[2]?.messages ?? []);
    expect(refused).toMatchObject({ is_error: true, content: budgetNotice });
    expect(triage.toolCalls).toBe(1);
  });

  it("returns tool errors to the model instead of failing", async () => {
    const gateway = new ScriptedGateway([
      reply([
        toolCall("read_file", { path: "missing.ts", startLine: 1, endLine: 2 }),
        toolCall("delete_file", { path: "src/checkout.ts" }),
        toolCall("read_attachment", { name: "api:0:trace" }),
      ]),
      reply([submit("Received: 201", "O1")]),
    ]);

    await new TriageAgent(gateway).triage(aFailure(), workspace);

    expect(
      toolResults(gateway.requests[1]?.messages ?? []).map(textOf),
    ).toEqual([
      "missing.ts does not exist",
      "There is no tool named delete_file.",
      "There is no attachment named api:0:trace. Available: none",
    ]);
  });

  it("shows screenshots as images that cannot be quoted", async () => {
    const screenshot = {
      name: "chromium:0:screenshot",
      contentType: "image/png",
      body: Buffer.from("png").toString("base64"),
    };
    const gateway = new ScriptedGateway([
      reply([toolCall("read_attachment", { name: screenshot.name })]),
      reply([submit("Received: 201", "O1")]),
    ]);

    await new TriageAgent(gateway).triage(
      aFailure({ attachments: [screenshot] }),
      workspace,
    );

    const [result] = toolResults(gateway.requests[1]?.messages ?? []);
    expect(textOf(result)).toBe(
      "[O2] read_attachment chromium:0:screenshot\nImage image/png, shown below. Images cannot be quoted as evidence.\n[image]",
    );
  });

  it("reminds the model once to submit and then gives up", async () => {
    const gateway = new ScriptedGateway([
      textReply("I think it is a defect."),
      textReply("Still a defect."),
    ]);

    const triage = await new TriageAgent(gateway).triage(aFailure(), workspace);

    expect(lastUserContent(gateway.requests[1]?.messages ?? [])).toEqual([
      { type: "text", text: verdictReminder },
    ]);
    expect(triage).toMatchObject({
      cause: "inconclusive",
      termination: "no-verdict",
    });
  });

  it("gives up when the model declines", async () => {
    const gateway = new ScriptedGateway([reply([], "refusal")]);

    const triage = await new TriageAgent(gateway).triage(aFailure(), workspace);

    expect(triage).toMatchObject({
      cause: "inconclusive",
      termination: "refusal",
    });
  });

  it("stops after a bounded number of turns", async () => {
    const gateway = new ScriptedGateway(
      Array.from({ length: 10 }, () => reply([readCheckout()])),
    );

    const triage = await new TriageAgent(gateway, {
      maxToolCalls: 2,
      maxRejectedVerdicts: 0,
    }).triage(aFailure(), workspace);

    expect(triage.termination).toBe("limit-reached");
    expect(gateway.requests).toHaveLength(5);
  });

  it("offers reruns only when the workspace can run tests", async () => {
    const runner: TestRunner = {
      rerun: (): Promise<RerunOutcome> =>
        Promise.resolve({
          project: "api",
          runs: 3,
          passed: 1,
          failed: 2,
          errors: ["Received: 201"],
        }),
    };
    const gateway = new ScriptedGateway([
      reply([toolCall("rerun_test", { project: "api", times: 9 })]),
      reply([submit("Received: 201", "O1")]),
    ]);

    await new TriageAgent(gateway).triage(aFailure(), { ...workspace, runner });
    const withoutRunner = new ScriptedGateway([
      reply([submit("Received: 201", "O1")]),
    ]);
    await new TriageAgent(withoutRunner).triage(aFailure(), workspace);

    const toolNames = (requests: ScriptedGateway["requests"]) =>
      requests[0]?.tools.map((tool) => tool.name) ?? [];
    expect(toolNames(gateway.requests)).toContain("rerun_test");
    expect(toolNames(withoutRunner.requests)).not.toContain("rerun_test");
    expect(
      textOf(toolResults(gateway.requests[1]?.messages ?? [])[0]),
    ).toContain("rerun_test api ×5\nRan 3 times in api: 1 passed, 2 failed.");
  });
});
