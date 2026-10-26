import { readFile } from "node:fs/promises";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

import { z } from "zod";

import type {
  Attachment,
  Attempt,
  Failure,
  SourceLocation,
  TestError,
} from "../domain/failure.ts";
import { toPosix } from "../shared/text.ts";

const locationSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
});

const errorSchema = z.object({
  message: z.string().optional(),
  value: z.string().optional(),
  stack: z.string().optional(),
  snippet: z.string().optional(),
  location: locationSchema.optional(),
});

const attachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  path: z.string().optional(),
  body: z.string().optional(),
});

const outputSchema = z.union([
  z.object({ text: z.string() }),
  z.object({ buffer: z.string() }),
]);

const resultSchema = z.object({
  retry: z.number(),
  status: z.enum(["passed", "failed", "timedOut", "interrupted", "skipped"]),
  duration: z.number(),
  errors: z.array(errorSchema).default([]),
  stdout: z.array(outputSchema).default([]),
  stderr: z.array(outputSchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
});

const testSchema = z.object({
  projectName: z.string(),
  status: z.enum(["expected", "unexpected", "flaky", "skipped"]),
  expectedStatus: z
    .enum(["passed", "failed", "timedOut", "interrupted", "skipped"])
    .default("passed"),
  results: z.array(resultSchema),
});

const specSchema = z.object({
  title: z.string(),
  file: z.string(),
  line: z.number(),
  column: z.number(),
  tests: z.array(testSchema),
});

type Spec = z.output<typeof specSchema>;
type Result = z.output<typeof resultSchema>;
type ReportedError = z.output<typeof errorSchema>;

interface Suite {
  title: string;
  specs: Spec[];
  suites?: Suite[] | undefined;
}

const suiteSchema: z.ZodType<Suite> = z.lazy(() =>
  z.object({
    title: z.string(),
    specs: z.array(specSchema).default([]),
    suites: z.array(suiteSchema).optional(),
  }),
);

export const reportSchema = z.object({
  config: z.object({
    configFile: z.string().optional(),
    rootDir: z.string(),
  }),
  suites: z.array(suiteSchema).default([]),
  errors: z.array(errorSchema).default([]),
});

export type PlaywrightReport = z.output<typeof reportSchema>;

const readableContentTypes = [/^text\//, /^application\/json/, /^image\//];

export async function readReport(file: string): Promise<PlaywrightReport> {
  const content: unknown = JSON.parse(await readFile(file, "utf8"));
  return reportSchema.parse(content);
}

export async function readFailures(file: string): Promise<Failure[]> {
  return collectFailures(await readReport(file));
}

export function collectFailures(report: PlaywrightReport): Failure[] {
  const paths = new ReportPaths(report.config);
  const setup = report.errors.map((error, index) =>
    setupFailure(error, index, paths),
  );
  const tests = [...specsOf(report.suites)].flatMap(({ spec, titles }) => {
    const failure = testFailure(spec, titles, paths);
    return failure === undefined ? [] : [failure];
  });
  const failedFirst = (failure: Failure) =>
    failure.failedIn.length > 0 ? 0 : 1;
  return [...setup, ...tests.sort((a, b) => failedFirst(a) - failedFirst(b))];
}

export interface TestSelection {
  file: string;
  line: number;
  title: string;
  project: string;
}

export function countResults(
  report: PlaywrightReport,
  selection?: TestSelection,
): {
  passed: number;
  failed: number;
  errors: string[];
} {
  const paths = new ReportPaths(report.config);
  const results = [...specsOf(report.suites)]
    .filter(
      ({ spec, titles }) =>
        selection === undefined ||
        (paths.testFile(spec.file) === selection.file &&
          spec.line === selection.line &&
          titles.join(" › ") === selection.title),
    )
    .flatMap(({ spec }) =>
      spec.tests
        .filter(
          (test) =>
            selection === undefined || test.projectName === selection.project,
        )
        .flatMap((test) =>
          test.results.map((result) => ({
            result,
            expectedStatus: test.expectedStatus,
          })),
        ),
    );
  const completed = results.filter(({ result }) => result.status !== "skipped");
  const failed = completed.filter(({ result, expectedStatus }) =>
    isFailedResult(result, expectedStatus),
  );
  const errors = [
    ...report.errors,
    ...failed.flatMap(({ result, expectedStatus }) =>
      errorsOf(result, expectedStatus),
    ),
  ].map((error) => firstLine(toTestError(error, paths).message));
  return {
    passed: completed.length - failed.length,
    failed: failed.length,
    errors: [...new Set(errors)],
  };
}

function* specsOf(
  suites: Suite[],
  titles: string[] = [],
  depth = 0,
): Generator<{ spec: Spec; titles: string[] }> {
  for (const suite of suites) {
    const scope = depth === 0 ? titles : [...titles, suite.title];
    for (const spec of suite.specs) {
      yield { spec, titles: [...scope, spec.title] };
    }
    yield* specsOf(suite.suites ?? [], scope, depth + 1);
  }
}

function testFailure(
  spec: Spec,
  titles: string[],
  paths: ReportPaths,
): Failure | undefined {
  const failing = spec.tests.filter(
    (test) => test.status === "unexpected" || test.status === "flaky",
  );
  const failedResults = failing.flatMap((test) =>
    test.results
      .filter((result) => isFailedResult(result, test.expectedStatus))
      .map((result) => ({
        project: test.projectName,
        expectedStatus: test.expectedStatus,
        result,
      })),
  );
  const first = failedResults[0];
  if (first === undefined) return undefined;

  const file = paths.testFile(spec.file);
  const title = titles.join(" › ");
  const projectsWith = (status: string) =>
    spec.tests
      .filter((test) => test.status === status)
      .map((test) => test.projectName);

  return {
    id: `${file}:${spec.line} ${title}`,
    kind: "test",
    title,
    location: { file, line: spec.line, column: spec.column },
    failedIn: projectsWith("unexpected"),
    flakyIn: projectsWith("flaky"),
    passedIn: projectsWith("expected"),
    error: combinedError(errorsOf(first.result, first.expectedStatus), paths),
    attempts: failing.flatMap((test) =>
      test.results.map((result) => toAttempt(test.projectName, result)),
    ),
    attachments: failedResults.flatMap(({ project, result }) =>
      readableAttachments(project, result, paths),
    ),
    stdout: failedResults.map(({ result }) => textOf(result.stdout)).join(""),
    stderr: failedResults.map(({ result }) => textOf(result.stderr)).join(""),
  };
}

function setupFailure(
  error: ReportedError,
  index: number,
  paths: ReportPaths,
): Failure {
  const testError = toTestError(error, paths);
  return {
    id: `setup-${index + 1}`,
    kind: "setup",
    title: "Test run setup",
    location: testError.location ?? paths.configLocation(),
    failedIn: [],
    flakyIn: [],
    passedIn: [],
    error: testError,
    attempts: [],
    attachments: [],
    stdout: "",
    stderr: "",
  };
}

function combinedError(errors: ReportedError[], paths: ReportPaths): TestError {
  const converted = errors.map((error) => toTestError(error, paths));
  const located =
    converted.find((error) => error.location !== undefined) ?? converted[0];
  return {
    ...located,
    message:
      converted.map((error) => error.message).join("\n\n") || "Unknown error",
  };
}

function toTestError(error: ReportedError, paths: ReportPaths): TestError {
  const message = paths.clean(error.message ?? error.value ?? "Unknown error");
  return {
    message,
    ...(error.stack === undefined ? {} : { stack: paths.clean(error.stack) }),
    ...(error.snippet === undefined
      ? {}
      : { snippet: paths.clean(error.snippet) }),
    ...(error.location === undefined
      ? {}
      : { location: paths.location(error.location) }),
  };
}

function toAttempt(project: string, result: Result): Attempt {
  return {
    project,
    retry: result.retry,
    status: result.status,
    durationMs: result.duration,
  };
}

function readableAttachments(
  project: string,
  result: Result,
  paths: ReportPaths,
): Attachment[] {
  return result.attachments
    .filter((attachment) =>
      readableContentTypes.some((type) => type.test(attachment.contentType)),
    )
    .map((attachment) => ({
      name: `${project}:${result.retry}:${attachment.name}`,
      contentType: attachment.contentType,
      ...(attachment.path === undefined
        ? {}
        : { path: paths.relative(attachment.path) }),
      ...(attachment.body === undefined ? {} : { body: attachment.body }),
    }));
}

function isFailedResult(result: Result, expectedStatus: string): boolean {
  return result.status !== expectedStatus && result.status !== "skipped";
}

function errorsOf(result: Result, expectedStatus: string): ReportedError[] {
  if (result.errors.length > 0) return result.errors;
  return [
    {
      message: `Test ${result.status} unexpectedly; expected ${expectedStatus}.`,
    },
  ];
}

function textOf(chunks: z.output<typeof outputSchema>[]): string {
  return chunks
    .map((chunk) =>
      "text" in chunk
        ? chunk.text
        : Buffer.from(chunk.buffer, "base64").toString(),
    )
    .join("");
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? "";
}

class ReportPaths {
  readonly #root: string;
  readonly #testRoot: string;
  readonly #configFile: string | undefined;
  readonly #rootPattern: RegExp;

  constructor(config: PlaywrightReport["config"]) {
    const rootDir = toPosix(config.rootDir);
    this.#configFile =
      config.configFile === undefined ? undefined : toPosix(config.configFile);
    this.#root =
      this.#configFile === undefined
        ? rootDir
        : path.posix.dirname(this.#configFile);
    this.#rootPattern = rootPattern(this.#root);
    this.#testRoot = rootDir === this.#root ? "" : this.relative(rootDir);
  }

  clean(text: string): string {
    return stripVTControlCharacters(text).replace(this.#rootPattern, "");
  }

  relative(file: string): string {
    return toPosix(this.clean(file));
  }

  testFile(file: string): string {
    return path.posix.join(this.#testRoot, toPosix(file));
  }

  location(location: SourceLocation): SourceLocation {
    return { ...location, file: this.relative(location.file) };
  }

  configLocation(): SourceLocation {
    return {
      file:
        this.#configFile === undefined ? "" : this.relative(this.#configFile),
      line: 0,
      column: 0,
    };
  }
}

function rootPattern(root: string): RegExp {
  const separator = String.raw`[\\/]`;
  const segments = root
    .split("/")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
  const caseInsensitive = /^[a-z]:$/i.test(segments[0] ?? "");
  return new RegExp(
    `${segments.join(separator)}${separator}`,
    caseInsensitive ? "gi" : "g",
  );
}
