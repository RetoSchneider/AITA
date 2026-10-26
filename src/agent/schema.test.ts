import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toInputSchema } from "./schema.ts";

describe("toInputSchema", () => {
  it("drops keywords that strict tool schemas do not support", () => {
    const schema = toInputSchema(
      z.object({
        times: z.number().int().min(1).max(5),
        name: z.string().min(2),
        tags: z.array(z.string()).max(3),
      }),
    );

    expect(schema).toEqual({
      type: "object",
      properties: {
        times: { type: "integer" },
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["times", "name", "tags"],
      additionalProperties: false,
    });
  });

  it("keeps properties whose names match a dropped keyword", () => {
    const schema = toInputSchema(z.object({ maximum: z.string() }));

    expect(schema.properties).toEqual({ maximum: { type: "string" } });
  });

  it("keeps nullable objects closed to extra properties", () => {
    const schema = toInputSchema(
      z.object({ report: z.object({ title: z.string() }).nullable() }),
    );

    expect(schema.properties).toEqual({
      report: {
        anyOf: [
          {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
    });
  });

  it("rejects schemas that are not objects", () => {
    expect(() => toInputSchema(z.string())).toThrow("must describe an object");
  });
});
