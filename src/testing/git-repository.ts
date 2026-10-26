import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { git } from "../shared/git.ts";

export interface TemporaryRepository {
  root: string;
  commit(files: Record<string, string>, message: string): Promise<string>;
  remove(): Promise<void>;
}

export async function temporaryRepository(): Promise<TemporaryRepository> {
  const root = await mkdtemp(path.join(tmpdir(), "aita-spec-"));
  await git(root, ["init", "--quiet", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "Spec"]);
  await git(root, ["config", "user.email", "spec@example.com"]);
  await git(root, ["config", "core.autocrlf", "false"]);

  return {
    root,
    async commit(files, message) {
      for (const [file, content] of Object.entries(files)) {
        const target = path.join(root, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
      }
      await git(root, ["add", "--all"]);
      await git(root, ["commit", "--quiet", "--message", message]);
      return (await git(root, ["rev-parse", "HEAD"])).trim();
    },
    async remove() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
