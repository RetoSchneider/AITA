import type { TriageAgent } from "./agent/triage-agent.ts";
import type { Failure } from "./domain/failure.ts";
import type { Triage } from "./domain/triage.ts";
import { mapConcurrently } from "./shared/concurrency.ts";
import type { Workspace } from "./workspace/workspace.ts";

export interface TriageEntry {
  failure: Failure;
  triage: Triage;
}

export interface TriageRun {
  model: string;
  entries: TriageEntry[];
  skipped: Failure[];
}

export interface TriageRunOptions {
  maxFailures: number;
  concurrency: number;
  onTriaged?: (entry: TriageEntry) => void;
}

export async function triageFailures(
  failures: Failure[],
  agent: TriageAgent,
  workspace: Workspace,
  options: TriageRunOptions,
): Promise<TriageRun> {
  const selected = failures.slice(0, options.maxFailures);
  const entries = await mapConcurrently(
    selected,
    options.concurrency,
    async (failure) => {
      const entry = { failure, triage: await agent.triage(failure, workspace) };
      options.onTriaged?.(entry);
      return entry;
    },
  );
  return {
    model: agent.model,
    entries,
    skipped: failures.slice(options.maxFailures),
  };
}
