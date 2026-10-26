import { mkdir, mkdtemp } from "node:fs/promises";
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
      const mirror = await this.#mirror();
      const root = await mkdtemp(path.join(tmpdir(), "aita-"));
      await git(mirror, ["worktree", "add", "--detach", root, this.#revision]);
      if (testCase.patch !== undefined) {
        await git(root, ["apply", "--whitespace=nowarn", testCase.patch]);
        await git(root, ["add", "--all"]);
        await git(root, [
          "-c",
          "user.name=SeatWise Developer",
          "-c",
          "user.email=developer@example.com",
          "commit",
          "--quiet",
          "--message",
          testCase.commit ?? testCase.title,
        ]);
      }
      return {
        root,
        baseline: this.#revision,
        dispose: () =>
          this.#exclusive(async () => {
            await git(mirror, ["worktree", "remove", "--force", root]);
          }),
      };
    });
  }

  async #mirror(): Promise<string> {
    const mirror = path.join(this.#cacheDirectory, "repository");
    if (!(await exists(mirror))) {
      await mkdir(this.#cacheDirectory, { recursive: true });
      await git(process.cwd(), [
        "clone",
        "--quiet",
        "--no-checkout",
        "--config",
        "core.autocrlf=false",
        this.#source,
        mirror,
      ]);
    }
    const known = await git(
      mirror,
      ["rev-parse", "--verify", "--quiet", `${this.#revision}^{commit}`],
      [0, 1],
    );
    if (known.trim() === "") {
      await git(mirror, ["fetch", "--quiet", "origin", this.#revision]);
    }
    return mirror;
  }

  #exclusive<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#queue.then(task);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}
