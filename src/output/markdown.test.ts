import { describe, expect, it } from "vitest";

import { aFailure, aTriage } from "../testing/builders.ts";
import { renderRun } from "./markdown.ts";

describe("renderRun", () => {
  it("summarizes the run and explains every failure", () => {
    const markdown = renderRun({
      model: "claude-opus-5-5",
      entries: [
        {
          failure: aFailure(),
          triage: aTriage({
            bugReport: {
              title: "Reused key creates a second order",
              severity: "critical",
              steps: ["Check out with key K", "Check out again with key K"],
              expected: "409 Conflict",
              actual: "201 Created",
              suspectedCause: "The hash comparison was removed.",
            },
          }),
        },
        {
          failure: aFailure({
            title: "Booking › shows seats",
            location: { file: "tests/ui/booking.spec.ts", line: 30, column: 3 },
            failedIn: [],
            flakyIn: ["webkit"],
          }),
          triage: aTriage({ cause: "flaky-test", confidence: "medium" }),
        },
      ],
      skipped: [],
    });

    expect(markdown).toContain(
      "2 failures triaged: 1 × product defect, 1 × flaky test.",
    );
    expect(markdown).toContain(
      "| Checkout › rejects a reused key | Product defect | high |",
    );
    expect(markdown).toContain(
      "`tests/api/checkout.spec.ts:12` · failed in api · high confidence",
    );
    expect(markdown).toContain(
      "`tests/ui/booking.spec.ts:30` · passed on retry in webkit",
    );
    expect(markdown).toContain(
      "- The second checkout succeeded.\n  > Received: 201",
    );
    expect(markdown).toContain(
      "**Bug report: Reused key creates a second order** (critical)",
    );
    expect(markdown).toContain(
      "1. Check out with key K\n2. Check out again with key K",
    );
    expect(markdown).toContain(
      "<sub>claude-opus-5-5 · 6 tool calls · 2.0k input and 400 output tokens · $0.02 · 8 s agent time</sub>",
    );
  });

  it("marks quotes that were not found in the cited observation", () => {
    const markdown = renderRun({
      model: "claude-opus-5-5",
      entries: [
        {
          failure: aFailure(),
          triage: aTriage({
            evidence: [
              {
                observation: "O2",
                quote: "x",
                relevance: "Claimed",
                verified: false,
              },
            ],
          }),
        },
      ],
      skipped: [],
    });

    expect(markdown).toContain(
      "- Claimed _(quote not found in the cited observation)_",
    );
  });

  it("names failures that were not triaged and escapes table cells", () => {
    const markdown = renderRun({
      model: "claude-opus-5-5",
      entries: [{ failure: aFailure({ title: "a | b" }), triage: aTriage() }],
      skipped: [
        aFailure({ location: { file: "tests/x.spec.ts", line: 4, column: 1 } }),
      ],
    });

    expect(markdown).toContain("| a \\| b |");
    expect(markdown).toContain("1 more failure not triaged: tests/x.spec.ts:4");
  });

  it("says so when there is nothing to triage", () => {
    expect(
      renderRun({ model: "claude-opus-5-5", entries: [], skipped: [] }),
    ).toContain("No failed or flaky tests.");
  });

  it("renders quoted HTML and Markdown literally instead of interpreting evidence", () => {
    const markdown = renderRun({
      model: "model<img src='remote'>",
      entries: [
        {
          failure: aFailure({ title: "Pay | now\n# hidden heading" }),
          triage: aTriage({
            summary: "The <button> is missing.",
            evidence: [
              {
                observation: "O2",
                quote:
                  "<button>Pay & confirm</button>\n![image](https://example.com)",
                relevance: "The missing **button**.",
                verified: true,
              },
            ],
          }),
        },
      ],
      skipped: [],
    });

    expect(markdown).toContain("| Pay \\| now \\# hidden heading |");
    expect(markdown).toContain("The &lt;button&gt; is missing.");
    expect(markdown).toContain("The missing \\*\\*button\\*\\*.");
    expect(markdown).toContain(
      "  > &lt;button&gt;Pay &amp; confirm&lt;/button&gt;",
    );
    expect(markdown).not.toContain("![image]");
    expect(markdown).not.toContain("<img");
  });

  it("keeps backticks in source filenames inside a single code span", () => {
    const markdown = renderRun({
      model: "model",
      entries: [
        {
          failure: aFailure({
            location: { file: "tests/`checkout`.spec.ts", line: 4, column: 1 },
          }),
          triage: aTriage(),
        },
      ],
      skipped: [],
    });

    expect(markdown).toContain("`` tests/`checkout`.spec.ts:4 ``");
  });
});
