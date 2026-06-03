import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCreatorDirectoryName } from "./path.js";

export interface AssetManifestEntry {
  bytes?: number;
  error?: string;
  path: string;
  sha256?: string;
  status: AssetStatus;
  url: string;
}
export type AssetStatus =
  | "complete"
  | "downloading"
  | "failed"
  | "obsolete"
  | "pending";

export interface CreatorManifest {
  creatorId: string;
  posts: Partial<Record<string, PostManifestEntry>>;
  schemaVersion: 1;
}

export interface PostManifestEntry {
  assets: Partial<Record<string, AssetManifestEntry>>;
  directory: string;
  error?: string;
  id: string;
  restricted: boolean;
  status: PostStatus;
  updatedDatetime: string;
}

export type PostStatus = "complete" | "failed" | "pending" | "skipped";

export class ManifestStore {
  readonly #creatorDirectory: string;
  readonly #manifestPath: string;

  public constructor(outputDirectory: string, creatorId: string) {
    this.#creatorDirectory = path.join(
      outputDirectory,
      createCreatorDirectoryName(creatorId, outputDirectory),
    );
    this.#manifestPath = path.join(this.#creatorDirectory, "manifest.json");
  }

  public async load(): Promise<CreatorManifest> {
    try {
      return JSON.parse(
        await readFile(this.#manifestPath, "utf8"),
      ) as CreatorManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      return {
        creatorId: path.basename(this.#creatorDirectory),
        posts: {},
        schemaVersion: 1,
      };
    }
  }

  public async save(manifest: CreatorManifest): Promise<void> {
    await mkdir(this.#creatorDirectory, { recursive: true });
    const temporaryPath = `${this.#manifestPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporaryPath, this.#manifestPath);
  }
}
