import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  override readonly name = "GitError";
}

interface ExecFailure {
  code: number | string;
  stdout: string;
  stderr: string;
}

export async function git(
  cwd: string,
  args: string[],
  acceptedExitCodes: number[] = [0],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    if (
      isExecFailure(error) &&
      acceptedExitCodes.includes(Number(error.code))
    ) {
      return error.stdout;
    }
    const detail = isExecFailure(error) ? error.stderr.trim() : String(error);
    throw new GitError(`git ${args[0] ?? ""} failed: ${detail}`);
  }
}

function isExecFailure(error: unknown): error is ExecFailure {
  return error instanceof Error && "stdout" in error && "code" in error;
}
