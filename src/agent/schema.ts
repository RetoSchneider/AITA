import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";

const unsupportedKeywords = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
]);

const schemaMaps = new Set(["properties", "$defs", "definitions"]);

export function toInputSchema(schema: z.ZodType): BetaTool.InputSchema {
  const converted = strip(z.toJSONSchema(schema));
  if (!isRecord(converted) || converted.type !== "object") {
    throw new Error("A tool input schema must describe an object");
  }
  return { ...converted, type: "object" };
}

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!isRecord(node)) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !unsupportedKeywords.has(key))
      .map(([key, value]) => [
        key,
        schemaMaps.has(key) && isRecord(value)
          ? Object.fromEntries(
              Object.entries(value).map(([name, inner]) => [
                name,
                strip(inner),
              ]),
            )
          : strip(value),
      ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
