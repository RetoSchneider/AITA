import { z } from "zod";

import { defaultModel, efforts } from "../agent/model.ts";

export class UsageError extends Error {
  override readonly name = "UsageError";
}

export const agentOptions = {
  model: { type: "string", default: defaultModel },
  effort: { type: "string", default: "high" },
  "max-tool-calls": { type: "string", default: "16" },
  concurrency: { type: "string", default: "2" },
  help: { type: "boolean", default: false },
} as const;

export const agentOptionsHelp = `  --model <id>            Claude model (default: ${defaultModel})
  --effort <level>        ${efforts.join(", ")} (default: high)
  --max-tool-calls <n>    Tool calls per failure (default: 16)
  --concurrency <n>       Failures investigated in parallel (default: 2)`;

export const agentSettingsSchema = z.object({
  model: z.string().min(1),
  effort: z.enum(efforts),
  "max-tool-calls": z.coerce.number().int().positive(),
  concurrency: z.coerce.number().int().positive(),
});

export function parseWith<Schema extends z.ZodType>(
  schema: Schema,
  values: unknown,
  usage: string,
): z.output<Schema> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    throw new UsageError(`${z.prettifyError(parsed.error)}\n\n${usage}`);
  }
  return parsed.data;
}

export function progress(message: string): void {
  process.stderr.write(`${message}\n`);
}
