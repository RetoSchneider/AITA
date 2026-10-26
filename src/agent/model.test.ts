import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { describeModelError } from "./model.ts";

describe("describeModelError", () => {
  it("reports the status and the message of an API error", () => {
    const error = new Anthropic.BadRequestError(
      400,
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API.",
        },
      },
      undefined,
      new Headers(),
    );

    expect(describeModelError(error)).toBe(
      "Claude API error 400: Your credit balance is too low to access the Anthropic API.",
    );
  });

  it("leaves other errors to the caller", () => {
    expect(describeModelError(new Error("disk full"))).toBeUndefined();
  });
});
