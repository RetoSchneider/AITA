import { readFile, stat } from "node:fs/promises";

import { git } from "../shared/git.ts";
import { resolveInside, WorkspaceError } from "./paths.ts";

const maxLinesPerRead = 300;
const maxSearchMatches = 80;
const maxMatchLength = 240;

const noBaseline =
  "No baseline revision was given, so there are no changes to compare against.";

export class Repository {
  readonly root: string;
  readonly baseline: string | undefined;

  constructor(root: string, baseline?: string) {
    this.root = root;
    this.baseline = baseline;
  }

  async readLines(file: string, start: number, end: number): Promise<string> {
    const target = await resolveInside(this.root, file);
    if (!(await stat(target)).isFile()) {
      throw new WorkspaceError(`${file} is not a file`);
    }
    const content = await readFile(target, "utf8");
    if (content.includes("\u0000")) {
      throw new WorkspaceError(`${file} is a binary file`);
    }
    const lines = content.split(/\r?\n/);
    const first = Math.min(Math.max(1, start), lines.length);
    const last = Math.min(
      lines.length,
      Math.max(first, end),
      first + maxLinesPerRead - 1,
    );
    const width = String(last).length;
    const numbered = lines
      .slice(first - 1, last)
      .map(
        (line, index) => `${String(first + index).padStart(width)} | ${line}`,
      );
    return [
      `${file}, lines ${first}-${last} of ${lines.length}`,
      ...numbered,
    ].join("\n");
  }

  async search(pattern: string, ignoreCase: boolean): Promise<string> {
    const output = await git(
      this.root,
      [
        "grep",
        "-n",
        "-I",
        "--no-color",
        "--perl-regexp",
        ...(ignoreCase ? ["-i"] : []),
        "-e",
        pattern,
      ],
      [0, 1],
    );
    const matches = output.split("\n").filter((line) => line.length > 0);
    if (matches.length === 0) return `No matches for ${pattern}`;
    const shown = matches
      .slice(0, maxSearchMatches)
      .map((line) =>
        line.length > maxMatchLength
          ? `${line.slice(0, maxMatchLength)}…`
          : line,
      );
    const hidden = matches.length - shown.length;
    return [...shown, ...(hidden > 0 ? [`${hidden} more matches`] : [])].join(
      "\n",
    );
  }

  async history(): Promise<string> {
    if (this.baseline === undefined) return noBaseline;
    const commits = await git(this.root, [
      "log",
      "--no-merges",
      "--format=commit %h%n%B",
      `${this.baseline}..HEAD`,
    ]);
    const files = await git(this.root, [
      "diff",
      "--stat=160",
      `${this.baseline}...HEAD`,
    ]);
    return [
      `Commits since ${this.baseline}:`,
      commits.trim() || "none",
      "",
      "Changed files:",
      files.trim() || "none",
    ].join("\n");
  }

  async diff(file: string): Promise<string> {
    if (this.baseline === undefined) return noBaseline;
    const output = await git(this.root, [
      "diff",
      `${this.baseline}...HEAD`,
      "--",
      file,
    ]);
    return output.trim() || `${file} has not changed since ${this.baseline}`;
  }
}
