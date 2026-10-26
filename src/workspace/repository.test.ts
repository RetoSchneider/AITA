import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { git } from "../shared/git.ts";
import { temporaryRepository } from "../testing/git-repository.ts";
import type { TemporaryRepository } from "../testing/git-repository.ts";
import { Repository } from "./repository.ts";

let fixture: TemporaryRepository;
let baseline: string;

beforeAll(async () => {
  fixture = await temporaryRepository();
  baseline = await fixture.commit(
    {
      "src/checkout.ts":
        "export function total(items) {\n  return items.length;\n}\n",
      "tests/checkout.spec.ts": "test('total', () => {});\n",
    },
    "Add checkout",
  );
  await fixture.commit(
    { "src/checkout.ts": "export function total(items) {\n  return 0;\n}\n" },
    "Simplify total\n\nThe total is computed by the payment provider now.",
  );
});

afterAll(async () => {
  await fixture.remove();
});

describe("Repository", () => {
  it("reads numbered lines and clamps the range to the file", async () => {
    const repository = new Repository(fixture.root);

    expect(await repository.readLines("src/checkout.ts", 2, 99)).toBe(
      "src/checkout.ts, lines 2-4 of 4\n2 |   return 0;\n3 | }\n4 | ",
    );
  });

  it("refuses paths outside the repository", async () => {
    const repository = new Repository(fixture.root);

    await expect(repository.readLines("../secret.txt", 1, 10)).rejects.toThrow(
      /does not exist|outside the workspace/,
    );
    await expect(repository.readLines("..", 1, 10)).rejects.toThrow(
      "outside the workspace",
    );
  });

  it("refuses directories", async () => {
    await expect(
      new Repository(fixture.root).readLines("src", 1, 10),
    ).rejects.toThrow("src is not a file");
  });

  it("finds matching lines and reports when nothing matches", async () => {
    const repository = new Repository(fixture.root);

    expect(await repository.search("RETURN 0", true)).toBe(
      "src/checkout.ts:2:  return 0;",
    );
    expect(await repository.search("refund", false)).toBe(
      "No matches for refund",
    );
  });

  it("understands Perl syntax such as inline flags and character classes", async () => {
    const repository = new Repository(fixture.root);

    expect(await repository.search(String.raw`(?i)RETURN \d`, false)).toBe(
      "src/checkout.ts:2:  return 0;",
    );
  });

  it("lists commits and changed files since the baseline", async () => {
    const history = await new Repository(fixture.root, baseline).history();

    expect(history).toContain("Simplify total");
    expect(history).toContain(
      "The total is computed by the payment provider now.",
    );
    expect(history).toContain("src/checkout.ts | 2 +-");
  });

  it("shows the diff of one file since the baseline", async () => {
    const repository = new Repository(fixture.root, baseline);

    expect(await repository.diff("src/checkout.ts")).toContain(
      "-  return items.length;\n+  return 0;",
    );
    expect(await repository.diff("tests/checkout.spec.ts")).toBe(
      `tests/checkout.spec.ts has not changed since ${baseline}`,
    );
  });

  it("explains that changes cannot be compared without a baseline", async () => {
    expect(await new Repository(fixture.root).history()).toMatch(
      /No baseline revision/,
    );
  });

  it("does not execute external diff commands configured by the repository", async () => {
    await git(fixture.root, [
      "config",
      "diff.external",
      "aita-external-diff-must-not-run",
    ]);
    try {
      const repository = new Repository(fixture.root, baseline);
      expect(await repository.diff("src/checkout.ts")).toContain("return 0;");
      expect(await repository.history()).toContain("src/checkout.ts");
    } finally {
      await git(fixture.root, ["config", "--unset", "diff.external"]);
    }
  });
});
