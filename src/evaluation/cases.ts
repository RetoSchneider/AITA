import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { causes } from "../domain/triage.ts";
import type { Cause } from "../domain/triage.ts";

export type ExpectedCause = Exclude<Cause, "inconclusive">;

export const expectedCauses = causes.filter(
  (cause): cause is ExpectedCause => cause !== "inconclusive",
);

const suiteSchema = z.object({
  repository: z.string(),
  revision: z.string(),
});

export type Suite = z.output<typeof suiteSchema>;

const definitionSchema = z.object({
  title: z.string(),
  expected: z.enum(causes).exclude(["inconclusive"]),
  fault: z.string(),
  commit: z.string().optional(),
});

export interface EvaluationCase extends z.output<typeof definitionSchema> {
  id: string;
  directory: string;
  patch: string | undefined;
  report: string;
  reruns: string;
}

export async function loadSuite(file: string): Promise<Suite> {
  return suiteSchema.parse(await readJson(file));
}

export async function loadCases(
  directory: string,
  only: string[] = [],
): Promise<EvaluationCase[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const available = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const unknown = only.filter((id) => !available.includes(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown evaluation cases: ${unknown.join(", ")}`);
  }
  const ids =
    only.length === 0 ? available : available.filter((id) => only.includes(id));
  return Promise.all(
    ids.map((id) => loadCase(path.resolve(directory, id), id)),
  );
}

async function loadCase(
  directory: string,
  id: string,
): Promise<EvaluationCase> {
  const definition = definitionSchema.parse(
    await readJson(path.join(directory, "case.json")),
  );
  const patch = path.join(directory, "fault.patch");
  const hasPatch = await exists(patch);
  if (hasPatch && definition.commit === undefined) {
    throw new Error(`Case ${id} has a fault.patch but no commit message`);
  }
  return {
    id,
    directory,
    ...definition,
    patch: hasPatch ? patch : undefined,
    report: path.join(directory, "report.json"),
    reruns: path.join(directory, "reruns.json"),
  };
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}
