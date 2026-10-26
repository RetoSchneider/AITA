import { describe, expect, it } from "vitest";

import { aFailure } from "../testing/builders.ts";
import { describeFailure } from "./briefing.ts";

describe("describeFailure", () => {
  it("lists where the test failed, every attempt and the attachments", () => {
    const briefing = describeFailure(
      aFailure({
        failedIn: ["chromium"],
        flakyIn: ["webkit"],
        passedIn: ["firefox"],
        attempts: [
          { project: "chromium", retry: 0, status: "failed", durationMs: 2500 },
          {
            project: "chromium",
            retry: 1,
            status: "timedOut",
            durationMs: 45000,
          },
        ],
        attachments: [
          {
            name: "chromium:0:error-context",
            contentType: "text/markdown",
            path: "a.md",
          },
        ],
        error: { message: "Error: boom", snippet: "> 12 | await pay();" },
        stdout: "seeded\n",
      }),
    );

    expect(briefing).toBe(
      [
        "Test: Checkout › rejects a reused key",
        "Location: tests/api/checkout.spec.ts:12",
        "Failed in: chromium",
        "Passed on retry in: webkit",
        "Passed in: firefox",
        "",
        "Attempts:",
        "- chromium, attempt 1: failed after 2.5 s",
        "- chromium, attempt 2: timedOut after 45.0 s",
        "",
        "Error:",
        "Error: boom",
        "",
        "Code at the failure:",
        "> 12 | await pay();",
        "",
        "Attachments: chromium:0:error-context (text/markdown)",
        "",
        "Standard output:",
        "seeded",
      ].join("\n"),
    );
  });

  it("describes setup failures without test details", () => {
    const briefing = describeFailure(
      aFailure({
        kind: "setup",
        error: { message: "webServer exited", stack: "webServer exited" },
      }),
    );

    expect(briefing).toBe(
      [
        "The test run failed before or around the tests themselves.",
        "",
        "Error:",
        "webServer exited",
        "",
        "Attachments: none",
      ].join("\n"),
    );
  });
});
