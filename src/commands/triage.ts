import { appendFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { z } from "zod";

import { AnthropicGateway } from "../agent/model.ts";
import { TriageAgent } from "../agent/triage-agent.ts";
import { causeLabels } from "../output/labels.ts";
import { renderRun } from "../output/markdown.ts";
import { readFailures } from "../playwright/report.ts";
import { PlaywrightRunner } from "../playwright/runner.ts";
import { plural } from "../shared/text.ts";
import { triageFailures } from "../triage-run.ts";
import { ArtifactStore } from "../workspace/artifacts.ts";
import { Repository } from "../workspace/repository.ts";
import {
  agentOptions,
  agentOptionsHelp,
  agentSettingsSchema,
  parseWith,
  progress,
} from "./cli.ts";

const usage = `Usage: aita triage --report <file> [options]

Finds out why the failed and flaky tests in a Playwright JSON report failed.

Options:
  --report <file>         Playwright JSON report (required)
  --repository <dir>      Repository under test (default: current directory)
  --artifacts <dir>       Directory that attachment paths are relative to (default: repository)
  --baseline <revision>   Revision where the tests last passed, such as origin/main
  --output <file>         Write the Markdown summary to a file instead of standard output
  --json <file>           Also write the full result as JSON
  --rerun                 Let the agent rerun failing tests
  --max-failures <n>      Investigate at most n failures (default: 10)
${agentOptionsHelp}`;

const optionsSchema = agentSettingsSchema.extend({
  report: z.string({ error: "--report is required" }),
  repository: z.string(),
  artifacts: z.string().optional(),
  baseline: z.string().optional(),
  output: z.string().optional(),
  json: z.string().optional(),
  rerun: z.boolean(),
  "max-failures": z.coerce.number().int().positive(),
});

export async function triageCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      ...agentOptions,
      report: { type: "string" },
      repository: { type: "string", default: "." },
      artifacts: { type: "string" },
      baseline: { type: "string" },
      output: { type: "string" },
      json: { type: "string" },
      rerun: { type: "boolean", default: false },
      "max-failures": { type: "string", default: "10" },
    },
  });
  if (values.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const options = parseWith(optionsSchema, values, usage);

  const failures = await readFailures(options.report);
  const agent = new TriageAgent(
    new AnthropicGateway({ model: options.model, effort: options.effort }),
    { maxToolCalls: options["max-tool-calls"] },
  );
  const workspace = {
    repository: new Repository(options.repository, options.baseline),
    artifacts: new ArtifactStore(options.artifacts ?? options.repository),
    runner: options.rerun
      ? new PlaywrightRunner(options.repository)
      : undefined,
  };

  const selected = Math.min(failures.length, options["max-failures"]);
  progress(
    `Investigating ${selected} of ${plural(failures.length, "failure")} with ${agent.model}`,
  );
  const run = await triageFailures(failures, agent, workspace, {
    maxFailures: options["max-failures"],
    concurrency: options.concurrency,
    onTriaged: ({ failure, triage }) => {
      progress(`${causeLabels[triage.cause]}: ${failure.title}`);
    },
  });

  const markdown = `${renderRun(run)}\n`;
  if (options.output === undefined) {
    process.stdout.write(markdown);
  } else {
    await writeFile(options.output, markdown);
  }
  if (options.json !== undefined) {
    await writeFile(options.json, `${JSON.stringify(run, null, 2)}\n`);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary !== undefined && summary !== "") {
    await appendFile(summary, markdown);
  }
}
