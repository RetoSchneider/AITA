export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface TestError {
  message: string;
  stack?: string;
  snippet?: string;
  location?: SourceLocation;
}

export type AttemptStatus =
  "passed" | "failed" | "timedOut" | "interrupted" | "skipped";

export interface Attempt {
  project: string;
  retry: number;
  status: AttemptStatus;
  durationMs: number;
}

export interface Attachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}

export interface Failure {
  id: string;
  kind: "test" | "setup";
  title: string;
  location: SourceLocation;
  failedIn: string[];
  flakyIn: string[];
  passedIn: string[];
  error: TestError;
  attempts: Attempt[];
  attachments: Attachment[];
  stdout: string;
  stderr: string;
}
