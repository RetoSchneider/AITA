import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { AnthropicGateway } from "../agent/model.ts";
import { TriageAgent } from "../agent/triage-agent.ts";
import { loadCases, loadSuite } from "../evaluation/cases.ts";
import { evaluateCases } from "../evaluation/evaluate.ts";
import { FixtureFactory } from "../evaluation/fixtures.ts";
import { renderScorecard } from "../evaluation/scorecard.ts";
import { score } from "../evaluation/scoring.ts";
import { causeLabels } from "../output/labels.ts";
import { plural } from "../shared/text.ts";
import {
  agentOptions,
  agentOptionsHelp,
  agentSettingsSchema,
  parseWith,
  progress,
} from "./cli.ts";

const usage = `Usage: aita evaluate [options]

Runs the agent on failures with a known cause and scores its verdicts.

Options:
  --cases <dir>           Evaluation cases (default: eval/cases)
  --suite <file>          Repository and revision the cases apply to (default: eval/suite.json)
  --source <repository>   Clone the repository from this URL or path instead
  --case <id>             Evaluate only this case, can be repeated
  --repeat <n>            Runs per case, to measure consistency (default: 1)
  --output <dir>          Where to write the scorecard (default: eval/results)
  --cache <dir>           Where to keep the repository clone (default: .cache)
${agentOptionsHelp}`;

const optionsSchema = agentSettingsSchema.extend({
  cases: z.string(),
  suite: z.string(),
  source: z.string().optional(),
  case: z.array(z.string()),
  repeat: z.coerce.number().int().positive(),
  output: z.string(),
  cache: z.string(),
});

export async function evaluateCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      ...agentOptions,
      cases: { type: "string", default: "eval/cases" },
      suite: { type: "string", default: "eval/suite.json" },
      source: { type: "string" },
      case: { type: "string", multiple: true, default: [] },
      repeat: { type: "string", default: "1" },
      output: { type: "string", default: "eval/results" },
      cache: { type: "string", default: ".cache" },
    },
  });
  if (values.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const options = parseWith(optionsSchema, values, usage);

  const suite = await loadSuite(options.suite);
  const cases = await loadCases(options.cases, options.case);
  const agent = new TriageAgent(
    new AnthropicGateway({ model: options.model, effort: options.effort }),
    { maxToolCalls: options["max-tool-calls"] },
  );
  const fixtures = new FixtureFactory({
    source: options.source ?? suite.repository,
    revision: suite.revision,
    cacheDirectory: options.cache,
  });

  progress(
    `Evaluating ${plural(cases.length, "case")} × ${options.repeat} with ${agent.model}`,
  );
  const runs = await evaluateCases(cases, fixtures, agent, {
    repeat: options.repeat,
    concurrency: options.concurrency,
    onRun: (run) => {
      const mark = run.triage.cause === run.expected ? "✓" : "✗";
      progress(
        `${mark} ${run.caseId} #${run.repetition}: ${causeLabels[run.triage.cause]}`,
      );
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  const modelName = options.model.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const name = `${date}-${modelName}-${options.effort}-${randomUUID()}`;
  const scorecard = renderScorecard(score(runs), runs, {
    model: options.model,
    effort: options.effort,
    repository: suite.repository,
    revision: suite.revision,
    date,
  });
  await mkdir(options.output, { recursive: true });
  await writeFile(path.join(options.output, `${name}.md`), `${scorecard}\n`, {
    flag: "wx",
  });
  await writeFile(
    path.join(options.output, `${name}.json`),
    `${JSON.stringify(runs, null, 2)}\n`,
    { flag: "wx" },
  );
  process.stdout.write(`${scorecard}\n`);
}
