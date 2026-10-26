#!/usr/bin/env node
import { describeModelError } from "./agent/model.ts";
import { evaluateCommand } from "./commands/evaluate.ts";
import { triageCommand } from "./commands/triage.ts";
import { messageOf } from "./shared/text.ts";

const commands = new Map([
  ["triage", triageCommand],
  ["evaluate", evaluateCommand],
]);

const usage = `Usage: aita <command> [options]

Commands:
  triage     Find out why the failed tests in a Playwright JSON report failed
  evaluate   Measure the agent on failures with a known cause

Run aita <command> --help for the options of a command.`;

const [name, ...args] = process.argv.slice(2);
const command = name === undefined ? undefined : commands.get(name);

if (command === undefined) {
  process.stdout.write(`${usage}\n`);
  process.exitCode = name === undefined || name === "--help" ? 0 : 1;
} else {
  await command(args).catch((error: unknown) => {
    process.stderr.write(`${describeModelError(error) ?? messageOf(error)}\n`);
    process.exitCode = 1;
  });
}
