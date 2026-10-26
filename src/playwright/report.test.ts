import { describe, expect, it } from "vitest";

import { collectFailures, countResults, reportSchema } from "./report.ts";

const passed = { retry: 0, status: "passed", duration: 800 };

function failedResult(retry: number, root: string, separator: string) {
  const file = [root, "tests", "ui", "booking.spec.ts"].join(separator);
  return {
    retry,
    status: "failed",
    duration: 1500,
    errors: [
      {
        message:
          "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m",
        stack: `Error: expect(locator).toBeVisible() failed\n    at ${file}:42:7`,
        snippet:
          "  41 |   await page.goto('/events');\n> 42 |   await expect(button).toBeVisible();",
        location: { file, line: 42, column: 7 },
      },
    ],
    stdout: [{ text: "seeded event\n" }],
    stderr: [{ buffer: Buffer.from("warning\n").toString("base64") }],
    attachments: [
      {
        name: "screenshot",
        contentType: "image/png",
        path: [root, "test-results", "booking", "failed.png"].join(separator),
      },
      {
        name: "trace",
        contentType: "application/zip",
        path: [root, "test-results", "booking", "trace.zip"].join(separator),
      },
      {
        name: "error-context",
        contentType: "text/markdown",
        path: [root, "test-results", "booking", "error-context.md"].join(
          separator,
        ),
      },
    ],
  };
}

function report(root: string, separator = "/") {
  return reportSchema.parse({
    config: {
      configFile: [root, "playwright.config.ts"].join(separator),
      rootDir: [root, "tests"].join(separator),
    },
    suites: [
      {
        title: "ui/booking.spec.ts",
        specs: [],
        suites: [
          {
            title: "Booking",
            specs: [
              {
                title: "shows the book button",
                file: "ui/booking.spec.ts",
                line: 40,
                column: 3,
                tests: [
                  {
                    projectName: "chromium",
                    status: "unexpected",
                    results: [
                      failedResult(0, root, separator),
                      failedResult(1, root, separator),
                    ],
                  },
                  {
                    projectName: "webkit",
                    status: "flaky",
                    results: [
                      failedResult(0, root, separator),
                      { ...passed, retry: 1 },
                    ],
                  },
                  {
                    projectName: "firefox",
                    status: "expected",
                    results: [passed],
                  },
                ],
              },
              {
                title: "lists events",
                file: "ui/booking.spec.ts",
                line: 60,
                column: 3,
                tests: [
                  {
                    projectName: "chromium",
                    status: "expected",
                    results: [passed],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
  });
}

describe("collectFailures", () => {
  it("keeps unexpectedly passing tests marked as expected failures", () => {
    const unexpectedPass = reportSchema.parse({
      config: { rootDir: "/ci" },
      suites: [
        {
          title: "checkout.spec.ts",
          specs: [
            {
              title: "known defect",
              file: "checkout.spec.ts",
              line: 8,
              column: 1,
              tests: [
                {
                  projectName: "api",
                  status: "unexpected",
                  expectedStatus: "failed",
                  results: [passed],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(collectFailures(unexpectedPass)).toMatchObject([
      {
        title: "known defect",
        failedIn: ["api"],
        error: { message: "Test passed unexpectedly; expected failed." },
        attempts: [{ status: "passed" }],
      },
    ]);
    expect(countResults(unexpectedPass)).toEqual({
      passed: 0,
      failed: 1,
      errors: ["Test passed unexpectedly; expected failed."],
    });
  });

  it("merges the projects of one spec into a single failure", () => {
    const [failure, ...others] = collectFailures(report("/home/ci/seatwise"));

    expect(others).toHaveLength(0);
    expect(failure).toMatchObject({
      kind: "test",
      title: "Booking › shows the book button",
      location: { file: "tests/ui/booking.spec.ts", line: 40, column: 3 },
      failedIn: ["chromium"],
      flakyIn: ["webkit"],
      passedIn: ["firefox"],
    });
    expect(
      failure?.attempts.map(
        (attempt) => `${attempt.project}:${attempt.status}`,
      ),
    ).toEqual([
      "chromium:failed",
      "chromium:failed",
      "webkit:failed",
      "webkit:passed",
    ]);
  });

  it("removes colors and the machine-specific root from messages and paths", () => {
    const [failure] = collectFailures(report("C:\\Users\\dev\\seatwise", "\\"));

    expect(failure?.error.message).toBe(
      "Error: expect(locator).toBeVisible() failed",
    );
    expect(failure?.error.stack).toContain(
      "at tests\\ui\\booking.spec.ts:42:7",
    );
    expect(failure?.error.location).toEqual({
      file: "tests/ui/booking.spec.ts",
      line: 42,
      column: 7,
    });
    expect(failure?.attachments[0]?.path).toBe(
      "test-results/booking/failed.png",
    );
  });

  it("keeps readable attachments of every failed attempt and skips traces", () => {
    const [failure] = collectFailures(report("/ci"));

    expect(failure?.attachments.map((attachment) => attachment.name)).toEqual([
      "chromium:0:screenshot",
      "chromium:0:error-context",
      "chromium:1:screenshot",
      "chromium:1:error-context",
      "webkit:0:screenshot",
      "webkit:0:error-context",
    ]);
  });

  it("decodes standard output of the failed attempts", () => {
    const [failure] = collectFailures(report("/ci"));

    expect(failure?.stdout).toBe("seeded event\n".repeat(3));
    expect(failure?.stderr).toBe("warning\n".repeat(3));
  });

  it("joins every error of a timed-out attempt and keeps the located one", () => {
    const timedOut = reportSchema.parse({
      config: { rootDir: "/ci" },
      suites: [
        {
          title: "a.spec.ts",
          specs: [
            {
              title: "pays",
              file: "a.spec.ts",
              line: 3,
              column: 1,
              tests: [
                {
                  projectName: "chromium",
                  status: "unexpected",
                  results: [
                    {
                      retry: 0,
                      status: "timedOut",
                      duration: 45000,
                      errors: [
                        { message: "Test timeout of 45000ms exceeded." },
                        {
                          message:
                            "Error: locator.click: Test timeout of 45000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Pay' })",
                          location: {
                            file: "/ci/a.spec.ts",
                            line: 8,
                            column: 5,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const [failure] = collectFailures(timedOut);

    expect(failure?.error).toEqual({
      message:
        "Test timeout of 45000ms exceeded.\n\nError: locator.click: Test timeout of 45000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Pay' })",
      location: { file: "a.spec.ts", line: 8, column: 5 },
    });
  });

  it("reports errors outside of tests as setup failures first", () => {
    const failures = collectFailures(
      reportSchema.parse({
        ...report("/ci"),
        errors: [
          { message: "Error: Process from config.webServer exited early." },
        ],
      }),
    );

    expect(failures.map((failure) => failure.kind)).toEqual(["setup", "test"]);
    expect(failures[0]).toMatchObject({
      id: "setup-1",
      location: { file: "playwright.config.ts", line: 0 },
    });
  });

  it("lists failures before tests that only passed on retry", () => {
    const flakyOnly = reportSchema.parse({
      config: { rootDir: "/ci" },
      suites: [
        {
          title: "a.spec.ts",
          specs: [
            {
              title: "flaky",
              file: "a.spec.ts",
              line: 1,
              column: 1,
              tests: [
                {
                  projectName: "api",
                  status: "flaky",
                  results: [failedResult(0, "/ci", "/"), passed],
                },
              ],
            },
            {
              title: "broken",
              file: "a.spec.ts",
              line: 9,
              column: 1,
              tests: [
                {
                  projectName: "api",
                  status: "unexpected",
                  results: [failedResult(0, "/ci", "/")],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(collectFailures(flakyOnly).map((failure) => failure.title)).toEqual([
      "broken",
      "flaky",
    ]);
  });
});

describe("countResults", () => {
  it("counts passed and failed runs and lists distinct error lines", () => {
    expect(countResults(report("/ci"))).toEqual({
      passed: 3,
      failed: 3,
      errors: ["Error: expect(locator).toBeVisible() failed"],
    });
  });

  it("counts only the selected test and project", () => {
    expect(
      countResults(report("/ci"), {
        file: "tests/ui/booking.spec.ts",
        line: 40,
        title: "Booking › shows the book button",
        project: "webkit",
      }),
    ).toEqual({
      passed: 1,
      failed: 1,
      errors: ["Error: expect(locator).toBeVisible() failed"],
    });
  });

  it("counts every repeat entry for the selected project", () => {
    const repeated = report("/ci");
    const spec = repeated.suites[0]?.suites?.[0]?.specs[0];
    const firefox = spec?.tests.find((test) => test.projectName === "firefox");
    if (spec === undefined || firefox === undefined) {
      throw new Error("Missing test fixture");
    }
    spec.tests.push(structuredClone(firefox));

    expect(
      countResults(repeated, {
        file: "tests/ui/booking.spec.ts",
        line: 40,
        title: "Booking › shows the book button",
        project: "firefox",
      }),
    ).toEqual({ passed: 2, failed: 0, errors: [] });
  });

  it("preserves setup errors even when no test ran", () => {
    expect(
      countResults(
        reportSchema.parse({
          config: { rootDir: "/ci" },
          errors: [
            { message: "Error: database unavailable\nConnection refused" },
          ],
        }),
      ),
    ).toEqual({
      passed: 0,
      failed: 0,
      errors: ["Error: database unavailable"],
    });
  });

  it("counts an expected failure as a successful run", () => {
    const expectedFailure = report("/ci");
    const spec = expectedFailure.suites[0]?.suites?.[0]?.specs[0];
    if (spec === undefined) throw new Error("Missing test fixture");
    spec.tests = [
      {
        projectName: "api",
        status: "expected",
        expectedStatus: "failed",
        results: [
          {
            ...failedResult(0, "/ci", "/"),
            status: "failed",
          },
        ],
      },
    ];

    expect(
      countResults(expectedFailure, {
        file: "tests/ui/booking.spec.ts",
        line: 40,
        title: "Booking › shows the book button",
        project: "api",
      }),
    ).toEqual({ passed: 1, failed: 0, errors: [] });
    expect(collectFailures(expectedFailure)).toEqual([]);
  });
});
