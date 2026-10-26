import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ArtifactStore } from "./artifacts.ts";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "aita-artifacts-"));
  await mkdir(path.join(root, "test-results"));
  await writeFile(
    path.join(root, "test-results", "error-context.md"),
    '- button "Book"',
  );
  await writeFile(path.join(root, "test-results", "failed.png"), png);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ArtifactStore", () => {
  it("reads text attachments from disk", async () => {
    const artifact = await new ArtifactStore(root).read({
      name: "chromium:0:error-context",
      contentType: "text/markdown",
      path: "test-results/error-context.md",
    });

    expect(artifact).toEqual({ kind: "text", text: '- button "Book"' });
  });

  it("returns screenshots as base64 images", async () => {
    const artifact = await new ArtifactStore(root).read({
      name: "chromium:0:screenshot",
      contentType: "image/png",
      path: "test-results/failed.png",
    });

    expect(artifact).toEqual({
      kind: "image",
      mediaType: "image/png",
      data: png.toString("base64"),
    });
  });

  it("reads attachments embedded in the report", async () => {
    const artifact = await new ArtifactStore(root).read({
      name: "api:0:response",
      contentType: "application/json",
      body: Buffer.from('{"status":409}').toString("base64"),
    });

    expect(artifact).toEqual({ kind: "text", text: '{"status":409}' });
  });

  it("refuses attachment paths outside the artifact directory", async () => {
    await expect(
      new ArtifactStore(path.join(root, "test-results")).read({
        name: "escape",
        contentType: "text/plain",
        path: "../test-results/../../",
      }),
    ).rejects.toThrow(/outside the workspace|does not exist/);
  });
});
