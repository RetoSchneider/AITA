import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { git } from "../shared/git.ts";
import { temporaryRepository } from "../testing/git-repository.ts";
import type { TemporaryRepository } from "../testing/git-repository.ts";

const execFileAsync = promisify(execFile);
let source: TemporaryRepository;
let directory: string;

beforeEach(async () => {
  source = await temporaryRepository();
  const revision = await source.commit(
    { "tracked.txt": "original" },
    "Initial state",
  );
  directory = await mkdtemp(path.join(tmpdir(), "aita-recording-spec-"));
  await mkdir(path.join(directory, "cases"));
  await writeFile(
    path.join(directory, "suite.json"),
    JSON.stringify({ repository: source.root, revision }),
  );
});

afterEach(async () => {
  await source.remove();
  await rm(directory, { recursive: true, force: true });
});

function record(seatwise: string, workspace: string) {
  return execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.resolve("scripts/record-case.ts"),
      "--seatwise",
      seatwise,
      "--workspace",
      workspace,
      "--cases",
      path.join(directory, "cases"),
      "--suite",
      path.join(directory, "suite.json"),
    ],
    { timeout: 30_000 },
  );
}

describe("recording workspace", () => {
  it("refuses to reset the source repository when selected as the workspace", async () => {
    const checkout = path.join(directory, "seatwise");
    await git(directory, ["clone", "--quiet", source.root, checkout]);
    await writeFile(path.join(checkout, "tracked.txt"), "uncommitted work");

    await expect(record(checkout, directory)).rejects.toThrow(
      "workspace must be separate from the source repository",
    );

    expect(await readFile(path.join(checkout, "tracked.txt"), "utf8")).toBe(
      "uncommitted work",
    );
  });

  it("refuses to reset a workspace cloned from another repository", async () => {
    const workspace = path.join(directory, "recording");
    const checkout = path.join(workspace, "seatwise");
    await mkdir(workspace);
    await git(directory, ["clone", "--quiet", source.root, checkout]);
    await writeFile(path.join(checkout, "tracked.txt"), "uncommitted work");
    const other = await temporaryRepository();
    try {
      await expect(record(other.root, workspace)).rejects.toThrow(
        "workspace must be a dedicated clone",
      );

      expect(await readFile(path.join(checkout, "tracked.txt"), "utf8")).toBe(
        "uncommitted work",
      );
    } finally {
      await other.remove();
    }
  });
});
