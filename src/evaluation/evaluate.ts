import type { TriageAgent } from "../agent/triage-agent.ts";
import type { Failure } from "../domain/failure.ts";
import { readFailures } from "../playwright/report.ts";
import { mapConcurrently } from "../shared/concurrency.ts";
import { ArtifactStore } from "../workspace/artifacts.ts";
import { Repository } from "../workspace/repository.ts";
import type { EvaluationCase } from "./cases.ts";
import type { FixtureFactory } from "./fixtures.ts";
import { RecordedRunner } from "./recorded-runner.ts";
import type { CaseRun } from "./scoring.ts";

export interface EvaluationOptions {
  repeat: number;
  concurrency: number;
  onRun?: (run: CaseRun) => void;
}

export async function evaluateCases(
  cases: EvaluationCase[],
  fixtures: FixtureFactory,
  agent: TriageAgent,
  options: EvaluationOptions,
): Promise<CaseRun[]> {
  const perCase = await mapConcurrently(
    cases,
    options.concurrency,
    async (testCase) => {
      const failure = await failureOf(testCase);
      const fixture = await fixtures.create(testCase);
      try {
        const workspace = {
          repository: new Repository(fixture.root, fixture.baseline),
          artifacts: new ArtifactStore(testCase.directory),
          runner: await RecordedRunner.load(testCase.reruns),
        };
        const runs: CaseRun[] = [];
        for (
          let repetition = 1;
          repetition <= options.repeat;
          repetition += 1
        ) {
          const run = {
            caseId: testCase.id,
            title: testCase.title,
            expected: testCase.expected,
            repetition,
            triage: await agent.triage(failure, workspace),
          };
          options.onRun?.(run);
          runs.push(run);
        }
        return runs;
      } finally {
        await fixture.dispose();
      }
    },
  );
  return perCase.flat();
}

async function failureOf(testCase: EvaluationCase): Promise<Failure> {
  const failures = await readFailures(testCase.report);
  const [failure] = failures;
  if (failure === undefined) {
    throw new Error(`The report of case ${testCase.id} contains no failure`);
  }
  if (failures.length !== 1) {
    throw new Error(
      `The report of case ${testCase.id} must contain exactly one failure; found ${failures.length}`,
    );
  }
  return failure;
}
