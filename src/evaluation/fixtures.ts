import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { git } from "../shared/git.ts";
import type { EvaluationCase } from "./cases.ts";
import { exists } from "./cases.ts";

export interface Fixture {
  root: string;
  baseline: string;
  dispose(): Promise<void>;
}

export class FixtureFactory {
  readonly #source: string;
  readonly #revision: string;
  readonly #cacheDirectory: string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: {
    source: string;
    revision: string;
    cacheDirectory: string;
  }) {
    this.#source = options.source;
    this.#revision = options.revision;
    this.#cacheDirectory = path.resolve(options.cacheDirectory);
  }

  create(testCase: EvaluationCase): Promise<Fixture> {
    return this.#exclusive(async () => {
      const { root: mirror, baseline } = await this.#mirror();
      const root = await mkdtemp(path.join(tmpdir(), "aita-"));
      let registered = false;
      try {
        await git(mirror, ["worktree", "add", "--detach", root, baseline]);
        registered = true;
        if (testCase.patch !== undefined) {
          await git(root, ["apply", "--whitespace=nowarn", testCase.patch]);
          await git(root, ["add", "--all"]);
          await git(root, [
            "-c",
            "user.name=Evaluation Fixture",
            "-c",
            "user.email=fixture@example.com",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--quiet",
            "--message",
            testCase.commit ?? testCase.title,
          ]);
        }
      } catch (error) {
        try {
          if (registered) {
            await git(mirror, ["worktree", "remove", "--force", root]);
          } else {
            await rm(root, { recursive: true, force: true });
          }
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            `Could not prepare or remove evaluation fixture ${root}`,
          );
        }
        throw error;
      }
      return {
        root,
        baseline,
        dispose: () =>
          this.#exclusive(async () => {
            await git(mirror, ["worktree", "remove", "--force", root]);
          }),
      };
    });
  }

  async #mirror(): Promise<{ root: string; baseline: string }> {
    const mirror = path.join(this.#cacheDirectory, "repository");
    const source = await canonicalSource(this.#source);
    if (!(await exists(mirror))) {
      await mkdir(this.#cacheDirectory, { recursive: true });
      await git(process.cwd(), [
        "clone",
        "--quiet",
        "--no-checkout",
        "--config",
        "core.autocrlf=false",
        "--",
        source,
        mirror,
      ]);
    }
    const origin = (await git(mirror, ["remote", "get-url", "origin"])).trim();
    if ((await canonicalSource(origin)) !== source) {
      throw new Error(
        "The evaluation cache belongs to another repository. Use a different cache directory.",
      );
    }
    const known = (
      await git(
        mirror,
        [
          "rev-parse",
          "--verify",
          "--quiet",
          "--end-of-options",
          `${this.#revision}^{commit}`,
        ],
        [0, 1],
      )
    ).trim();
    if (known !== "") {
      return { root: mirror, baseline: known };
    }
    await git(mirror, ["fetch", "--quiet", "--", "origin", this.#revision]);
    const baseline = (
      await git(mirror, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"])
    ).trim();
    return { root: mirror, baseline };
  }

  #exclusive<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#queue.then(task);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}

async function canonicalSource(source: string): Promise<string> {
  return (await exists(source)) ? realpath(source) : source;
}
