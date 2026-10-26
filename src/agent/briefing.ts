import type { Failure } from "../domain/failure.ts";
import { clip } from "../shared/text.ts";

export function describeFailure(failure: Failure): string {
  const { error } = failure;
  return [
    ...(failure.kind === "setup"
      ? ["The test run failed before or around the tests themselves."]
      : [
          `Test: ${failure.title}`,
          `Location: ${failure.location.file}:${failure.location.line}`,
          `Failed in: ${list(failure.failedIn)}`,
          `Passed on retry in: ${list(failure.flakyIn)}`,
          `Passed in: ${list(failure.passedIn)}`,
          "",
          "Attempts:",
          ...failure.attempts.map(
            (attempt) =>
              `- ${attempt.project}, attempt ${attempt.retry + 1}: ${attempt.status} after ${seconds(attempt.durationMs)}`,
          ),
        ]),
    "",
    "Error:",
    clip(error.message, 4000),
    ...section("Code at the failure", error.snippet, 2000),
    ...section(
      "Stack",
      error.stack?.trim() === error.message.trim() ? undefined : error.stack,
      2000,
    ),
    "",
    `Attachments: ${list(
      failure.attachments.map(
        (attachment) => `${attachment.name} (${attachment.contentType})`,
      ),
    )}`,
    ...section("Standard output", failure.stdout, 2000),
    ...section("Standard error", failure.stderr, 2000),
  ].join("\n");
}

function section(title: string, content: string | undefined, limit: number) {
  return content === undefined || content.trim() === ""
    ? []
    : ["", `${title}:`, clip(content.trimEnd(), limit)];
}

function list(items: string[]): string {
  return items.length === 0 ? "none" : items.join(", ");
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}
