import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateCases } from "../evaluation/evaluate.ts";
import { aTriage } from "../testing/builders.ts";
import { evaluateCommand } from "./evaluate.ts";

vi.mock("../evaluation/evaluate.ts", () => ({ evaluateCases: vi.fn() }));

describe("evaluateCommand", () => {
  let output: string;

  beforeEach(async () => {
    output = await mkdtemp(path.join(tmpdir(), "aita-evaluation-output-"));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.mocked(evaluateCases).mockResolvedValue([
      {
        caseId: "checkout",
        title: "Checkout",
        expected: "product-defect",
        repetition: 1,
        triage: aTriage(),
      },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(output, { recursive: true, force: true });
  });

  it("preserves earlier results when the same model is evaluated again", async () => {
    await evaluateCommand(["--output", output]);
    const first = await readdir(output);
    const contents = await Promise.all(
      first.map((file) => readFile(path.join(output, file), "utf8")),
    );

    await evaluateCommand(["--output", output]);

    expect(await readdir(output)).toHaveLength(4);
    expect(
      await Promise.all(
        first.map((file) => readFile(path.join(output, file), "utf8")),
      ),
    ).toEqual(contents);
  });

  it("keeps model identifiers out of filesystem paths while preserving them in reports", async () => {
    await evaluateCommand([
      "--output",
      output,
      "--model",
      "provider/model:version",
    ]);

    const files = await readdir(output);
    expect(files).toHaveLength(2);
    const markdown = files.find((file) => file.endsWith(".md"));
    expect(markdown).toBeDefined();
    expect(await readFile(path.join(output, markdown ?? ""), "utf8")).toContain(
      "provider/model:version",
    );
  });
});
