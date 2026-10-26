import type { TestRunner } from "../playwright/runner.ts";
import type { ArtifactStore } from "./artifacts.ts";
import type { Repository } from "./repository.ts";

export interface Workspace {
  repository: Repository;
  artifacts: ArtifactStore;
  runner: TestRunner | undefined;
}
