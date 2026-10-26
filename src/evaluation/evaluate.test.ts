import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TriageAgent } from "../agent/triage-agent.ts";
import { aTriage, ScriptedGateway } from "../testing/builders.ts";
import type { EvaluationCase } from "./cases.ts";
import { evaluateCases } from "./evaluate.ts";
import { FixtureFactory } from "./fixtures.ts";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "aita-evaluate-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function scenario(errors: string[]) {
  const testCase: EvaluationCase = {
    id: "database-down",
    title: "Database unavailable",
    expected: "environment-issue",
    fault: "The database is stopped.",
    directory,
    patch: undefined,
    report: path.join(directory, "report.json"),
    reruns: path.join(directory, "reruns.json"),
  };
  await writeFile(
    testCase.report,
    JSON.stringify({
      config: { rootDir: directory },
      errors: errors.map((message) => ({ message })),
    }),
  );
  const fixtures = new FixtureFactory({
    source: directory,
    revision: "HEAD",
    cacheDirectory: directory,
  });
  const dispose = vi.fn<() => Promise<void>>().mockResolvedValue();
  const create = vi
    .spyOn(fixtures, "create")
    .mockResolvedValue({ root: directory, baseline: "HEAD", dispose });
  const agent = new TriageAgent(new ScriptedGateway([]));
  const triage = vi
    .spyOn(agent, "triage")
    .mockResolvedValue(aTriage({ cause: "environment-issue" }));
  return { testCase, fixtures, agent, create, triage, dispose };
}

describe("evaluateCases", () => {
  it.each([[], ["Database unavailable", "Port occupied"]])(
    "rejects reports without exactly one labeled failure: %j",
    async (...messages: string[]) => {
      const { testCase, fixtures, agent, create, triage } =
        await scenario(messages);

      await expect(
        evaluateCases([testCase], fixtures, agent, {
          repeat: 1,
          concurrency: 1,
        }),
      ).rejects.toThrow("report of case database-down");
      expect(create).not.toHaveBeenCalled();
      expect(triage).not.toHaveBeenCalled();
    },
  );

  it("records every repetition and releases the fixture", async () => {
    const { testCase, fixtures, agent, triage, dispose } = await scenario([
      "Database unavailable",
    ]);
    const onRun = vi.fn();

    const runs = await evaluateCases([testCase], fixtures, agent, {
      repeat: 2,
      concurrency: 1,
      onRun,
    });

    expect(runs.map((run) => run.repetition)).toEqual([1, 2]);
    expect(triage).toHaveBeenCalledTimes(2);
    expect(onRun).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("releases the fixture when the model fails", async () => {
    const { testCase, fixtures, agent, triage, dispose } = await scenario([
      "Database unavailable",
    ]);
    triage.mockRejectedValue(new Error("Model unavailable"));

    await expect(
      evaluateCases([testCase], fixtures, agent, { repeat: 1, concurrency: 1 }),
    ).rejects.toThrow("Model unavailable");
    expect(dispose).toHaveBeenCalledOnce();
  });
});
