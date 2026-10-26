import { realpath } from "node:fs/promises";
import path from "node:path";

export class WorkspaceError extends Error {
  override readonly name = "WorkspaceError";
}

export async function resolveInside(
  root: string,
  requested: string,
): Promise<string> {
  const base = await realpath(root);
  let target: string;
  try {
    target = await realpath(path.resolve(base, requested));
  } catch {
    throw new WorkspaceError(`${requested} does not exist`);
  }
  const relative = path.relative(base, target);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new WorkspaceError(`${requested} is outside the workspace`);
  }
  return target;
}
