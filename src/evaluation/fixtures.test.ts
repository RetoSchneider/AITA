import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { git } from "../shared/git.ts";
import { temporaryRepository } from "../testing/git-repository.ts";
import type { TemporaryRepository } from "../testing/git-repository.ts";
import { exists, loadCases } from "./cases.ts";
import { FixtureFactory } from "./fixtures.ts";

let source: TemporaryRepository;
let revision: string;
let workDirectory: string;

const patch = `diff --git a/src/checkout.ts b/src/checkout.ts
--- a/src/checkout.ts
+++ b/src/checkout.ts
@@ -1 +1 @@
-export const limit = 10;
+export const limit = 1;
`;

beforeAll(async () => {
  source = await temporaryRepository();
  revision = await source.commit(
    { "src/checkout.ts": "export const limit = 10;\n" },
    "Add limit",
  );
  workDirectory = await mkdtemp(path.join(tmpdir(), "aita-cases-"));
  await writeCase(
    "limit-regression",
    {
      title: "Order limit drops to one",
      expected: "product-defect",
      fault: "The order limit constant was lowered.",
      commit: "Tidy checkout constants",
    },
    patch,
  );
  await writeCase("database-down", {
    title: "Database is not reachable",
    expected: "environment-issue",
    fault: "The test database was stopped.",
  });
});

afterAll(async () => {
  await source.remove();
  await rm(workDirectory, { recursive: true, force: true });
});

async function writeCase(id: string, definition: object, faultPatch?: string) {
  const directory = path.join(workDirectory, "cases", id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "case.json"),
    JSON.stringify(definition),
  );
  if (faultPatch !== undefined) {
    await writeFile(path.join(directory, "fault.patch"), faultPatch);
  }
}

describe("loadCases", () => {
  it("loads every case with its optional patch", async () => {
    const cases = await loadCases(path.join(workDirectory, "cases"));

    expect(
      cases.map((testCase) => [testCase.id, testCase.patch !== undefined]),
    ).toEqual([
      ["database-down", false],
      ["limit-regression", true],
    ]);
  });

  it("rejects unknown case ids", async () => {
    await expect(
      loadCases(path.join(workDirectory, "cases"), ["missing"]),
    ).rejects.toThrow("Unknown evaluation cases: missing");
  });
});

describe("FixtureFactory", () => {
  it("checks out the revision, commits the fault on top and removes the worktree again", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "limit-regression",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const factory = new FixtureFactory({
      source: source.root,
      revision,
      cacheDirectory: path.join(workDirectory, "cache"),
    });

    const fixture = await factory.create(testCase);

    expect(
      await readFile(path.join(fixture.root, "src", "checkout.ts"), "utf8"),
    ).toBe("export const limit = 1;\n");
    expect(
      await git(fixture.root, ["log", "--format=%s", `${revision}..HEAD`]),
    ).toBe("Tidy checkout constants\n");
    expect(fixture.baseline).toBe(revision);

    await fixture.dispose();
    expect(await exists(fixture.root)).toBe(false);
  });

  it("leaves the revision untouched for cases without a patch", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "database-down",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const factory = new FixtureFactory({
      source: source.root,
      revision,
      cacheDirectory: path.join(workDirectory, "cache"),
    });

    const fixture = await factory.create(testCase);

    expect((await git(fixture.root, ["rev-parse", "HEAD"])).trim()).toBe(
      revision,
    );
    await fixture.dispose();
  });

  it("accepts a source and cache given relative to the working directory", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "database-down",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const factory = new FixtureFactory({
      source: path.relative(process.cwd(), source.root),
      revision,
      cacheDirectory: path.relative(
        process.cwd(),
        path.join(workDirectory, "relative-cache"),
      ),
    });

    const fixture = await factory.create(testCase);

    expect(
      await exists(path.join(workDirectory, "relative-cache", "repository")),
    ).toBe(true);
    await fixture.dispose();
  });

  it("removes the worktree when a fault cannot be applied", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "limit-regression",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const cacheDirectory = path.join(workDirectory, "cleanup-cache");
    const factory = new FixtureFactory({
      source: source.root,
      revision,
      cacheDirectory,
    });
    const initial = await factory.create(testCase);
    await initial.dispose();
    const mirror = path.join(cacheDirectory, "repository");
    const before = await git(mirror, ["worktree", "list", "--porcelain"]);

    await expect(
      factory.create({
        ...testCase,
        patch: path.join(workDirectory, "missing.patch"),
      }),
    ).rejects.toThrow("git apply failed");

    expect(await git(mirror, ["worktree", "list", "--porcelain"])).toBe(before);
    const recovered = await factory.create(testCase);
    await recovered.dispose();
  });

  it("rejects a cache created for a different source", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "database-down",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const cacheDirectory = path.join(workDirectory, "source-cache");
    const fixture = await new FixtureFactory({
      source: source.root,
      revision,
      cacheDirectory,
    }).create(testCase);
    await fixture.dispose();
    const other = await temporaryRepository();
    try {
      const factory = new FixtureFactory({
        source: other.root,
        revision,
        cacheDirectory,
      });

      await expect(factory.create(testCase)).rejects.toThrow(
        "cache belongs to another repository",
      );
    } finally {
      await other.remove();
    }
  });

  it("resolves a named revision to the immutable baseline commit", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "limit-regression",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const factory = new FixtureFactory({
      source: source.root,
      revision: "main",
      cacheDirectory: path.join(workDirectory, "named-revision-cache"),
    });
    const fixture = await factory.create(testCase);
    try {
      expect(fixture.baseline).toBe(revision);
    } finally {
      await fixture.dispose();
    }
  });

  it("uses the fetched commit when a named revision is missing from the cache", async () => {
    const [testCase] = await loadCases(path.join(workDirectory, "cases"), [
      "database-down",
    ]);
    if (testCase === undefined) throw new Error("case missing");
    const cacheDirectory = path.join(workDirectory, "fetch-cache");
    const initial = await new FixtureFactory({
      source: source.root,
      revision,
      cacheDirectory,
    }).create(testCase);
    await initial.dispose();
    await git(source.root, [
      "checkout",
      "--quiet",
      "-b",
      "new-evaluation-case",
    ]);
    try {
      const nextRevision = await source.commit(
        { "new-case.txt": "new revision" },
        "Add case",
      );
      const fixture = await new FixtureFactory({
        source: source.root,
        revision: "new-evaluation-case",
        cacheDirectory,
      }).create(testCase);
      try {
        expect(fixture.baseline).toBe(nextRevision);
        expect(
          await readFile(path.join(fixture.root, "new-case.txt"), "utf8"),
        ).toBe("new revision");
      } finally {
        await fixture.dispose();
      }
    } finally {
      await git(source.root, ["checkout", "--quiet", "main"]);
    }
  });
});
