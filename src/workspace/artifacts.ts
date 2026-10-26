import { readFile } from "node:fs/promises";

import type { Attachment } from "../domain/failure.ts";
import { resolveInside, WorkspaceError } from "./paths.ts";

const imageTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
export type ImageType = (typeof imageTypes)[number];

const maxImageBytes = 4 * 1024 * 1024;

export type Artifact =
  | { kind: "text"; text: string }
  | { kind: "image"; mediaType: ImageType; data: string };

export class ArtifactStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async read(attachment: Attachment): Promise<Artifact> {
    const content = await this.#content(attachment);
    if (isImageType(attachment.contentType)) {
      if (content.byteLength > maxImageBytes) {
        throw new WorkspaceError(`${attachment.name} is too large to view`);
      }
      return {
        kind: "image",
        mediaType: attachment.contentType,
        data: content.toString("base64"),
      };
    }
    if (content.includes(0)) {
      throw new WorkspaceError(`${attachment.name} is not a text attachment`);
    }
    return { kind: "text", text: content.toString("utf8") };
  }

  async #content(attachment: Attachment): Promise<Buffer> {
    if (attachment.body !== undefined) {
      return Buffer.from(attachment.body, "base64");
    }
    if (attachment.path === undefined) {
      throw new WorkspaceError(`${attachment.name} has no content`);
    }
    return readFile(await resolveInside(this.#root, attachment.path));
  }
}

function isImageType(contentType: string): contentType is ImageType {
  return imageTypes.some((type) => type === contentType);
}
