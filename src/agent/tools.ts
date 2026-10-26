import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";

import type { Failure } from "../domain/failure.ts";
import type { RerunOutcome } from "../playwright/runner.ts";
import type { ImageType } from "../workspace/artifacts.ts";
import type { Workspace } from "../workspace/workspace.ts";
import { toInputSchema } from "./schema.ts";

export type ToolOutput =
  | { kind: "text"; label: string; text: string }
  | { kind: "image"; label: string; mediaType: ImageType; data: string };

export interface ToolContext {
  failure: Failure;
  workspace: Workspace;
}

export interface ExecutableTool {
  name: string;
  definition: BetaTool;
  run(input: unknown, context: ToolContext): Promise<ToolOutput>;
}

export class ToolInputError extends Error {
  override readonly name = "ToolInputError";
}

const maxReruns = 5;

function defineTool<Schema extends z.ZodType>(spec: {
  name: string;
  description: string;
  input: Schema;
  execute(input: z.output<Schema>, context: ToolContext): Promise<ToolOutput>;
}): ExecutableTool {
  return {
    name: spec.name,
    definition: {
      name: spec.name,
      description: spec.description,
      input_schema: toInputSchema(spec.input),
      strict: true,
    },
    async run(input, context) {
      const parsed = spec.input.safeParse(input);
      if (!parsed.success) {
        throw new ToolInputError(z.prettifyError(parsed.error));
      }
      return spec.execute(parsed.data, context);
    },
  };
}

const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read a range of lines from a file in the repository, such as the failing test, its helpers or the application code it exercises. Paths are relative to the repository root. Returns at most 300 numbered lines.",
  input: z.object({
    path: z.string().describe("File path relative to the repository root."),
    startLine: z.number().int().describe("First line to read, starting at 1."),
    endLine: z.number().int().describe("Last line to read."),
  }),
  async execute({ path, startLine, endLine }, { workspace }) {
    return {
      kind: "text",
      label: `read_file ${path}:${startLine}-${endLine}`,
      text: await workspace.repository.readLines(path, startLine, endLine),
    };
  },
});

const searchCodeTool = defineTool({
  name: "search_code",
  description:
    "Search the tracked files of the repository with a Perl-compatible regular expression, for example to find where an error message, route, label or selector is defined. Returns matching lines as path:line:text.",
  input: z.object({
    pattern: z.string().describe("Perl-compatible regular expression."),
    ignoreCase: z.boolean(),
  }),
  async execute({ pattern, ignoreCase }, { workspace }) {
    return {
      kind: "text",
      label: `search_code ${pattern}`,
      text: await workspace.repository.search(pattern, ignoreCase),
    };
  },
});

const listChangesTool = defineTool({
  name: "list_changes",
  description:
    "List the commits and changed files between the baseline revision, where the tests last passed, and the revision under test.",
  input: z.object({}),
  async execute(_input, { workspace }) {
    return {
      kind: "text",
      label: "list_changes",
      text: await workspace.repository.history(),
    };
  },
});

const diffFileTool = defineTool({
  name: "diff_file",
  description:
    "Show how one file changed between the baseline revision and the revision under test.",
  input: z.object({
    path: z.string().describe("File path relative to the repository root."),
  }),
  async execute({ path }, { workspace }) {
    return {
      kind: "text",
      label: `diff_file ${path}`,
      text: await workspace.repository.diff(path),
    };
  },
});

const readAttachmentTool = defineTool({
  name: "read_attachment",
  description:
    "Read an attachment of the failed test run. error-context attachments hold the page's accessibility snapshot at the moment of failure; screenshots are returned as images.",
  input: z.object({
    name: z
      .string()
      .describe(
        "Attachment name from the failure report, such as chromium:0:error-context.",
      ),
  }),
  async execute({ name }, { failure, workspace }) {
    const attachment = failure.attachments.find((item) => item.name === name);
    if (attachment === undefined) {
      const available = failure.attachments.map((item) => item.name).join(", ");
      throw new ToolInputError(
        `There is no attachment named ${name}. Available: ${available || "none"}`,
      );
    }
    const artifact = await workspace.artifacts.read(attachment);
    const label = `read_attachment ${name}`;
    return artifact.kind === "text"
      ? { kind: "text", label, text: artifact.text }
      : {
          kind: "image",
          label,
          mediaType: artifact.mediaType,
          data: artifact.data,
        };
  },
});

const rerunTestTool = defineTool({
  name: "rerun_test",
  description: `Run the failing test again in one Playwright project, without retries, to see whether it fails reliably. Runs it up to ${maxReruns} times. Each run takes real time, so use it once, when the cause depends on whether the failure reproduces.`,
  input: z.object({
    project: z
      .string()
      .describe("Playwright project in which the test failed."),
    times: z.number().int().describe(`How many runs, from 1 to ${maxReruns}.`),
  }),
  async execute({ project, times }, { failure, workspace }) {
    if (workspace.runner === undefined) {
      throw new ToolInputError("Reruns are not available in this workspace.");
    }
    if (failure.kind === "setup") {
      throw new ToolInputError("Only test failures can be rerun.");
    }
    if (![...failure.failedIn, ...failure.flakyIn].includes(project)) {
      throw new ToolInputError(
        `The test did not fail in project ${project}. Choose a project listed as failed or passed on retry.`,
      );
    }
    const runs = Math.min(Math.max(1, times), maxReruns);
    const outcome = await workspace.runner.rerun(failure, project, runs);
    return {
      kind: "text",
      label: `rerun_test ${project} ×${runs}`,
      text: describeRerun(outcome),
    };
  },
});

export function createTools(options: { rerun: boolean }): ExecutableTool[] {
  return [
    readFileTool,
    searchCodeTool,
    listChangesTool,
    diffFileTool,
    readAttachmentTool,
    ...(options.rerun ? [rerunTestTool] : []),
  ];
}

function describeRerun(outcome: RerunOutcome): string {
  return [
    `Ran ${outcome.runs} times in ${outcome.project}: ${outcome.passed} passed, ${outcome.failed} failed.`,
    ...(outcome.errors.length > 0 ? ["Errors:", ...outcome.errors] : []),
  ].join("\n");
}
