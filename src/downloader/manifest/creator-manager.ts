import type { Logger } from "pino";

import type { PathManager } from "../fs/path-manager.js";
import { CreatorManifest } from "./creator.js";

interface CreatorManifestManagerDeps {
  logger: Logger;
  pathManager: PathManager;
}

export class CreatorManifestManager {
  #logger: Logger;
  #manifests = new Map<string, CreatorManifest>();
  #pathManager: PathManager;

  constructor({ logger, pathManager }: CreatorManifestManagerDeps) {
    this.#logger = logger;
    this.#pathManager = pathManager;
  }

  getFailedCreatorIds(): string[] {
    const failed = new Set<string>();
    for (const [creatorId, manifest] of this.#manifests) {
      if (manifest.error || hasFailedPost(manifest)) failed.add(creatorId);
    }

    return [...failed];
  }

  async load(creatorId: string): Promise<CreatorManifest> {
    const manifest =
      this.#manifests.get(creatorId) ?? this.#createManifest(creatorId);

    await manifest.load();

    return manifest;
  }

  markFailed(creatorId: string, error: unknown): void {
    this.#manifests.get(creatorId)!.markFailed(error);
  }

  markSucceeded(creatorId: string): void {
    this.#manifests.get(creatorId)!.markSucceeded();
  }

  async saveAll(): Promise<void> {
    const manifests = Array.from(this.#manifests.values());
    await Promise.all(manifests.map((manifest) => manifest.save()));
  }

  #createManifest(creatorId: string): CreatorManifest {
    const manifest = new CreatorManifest(
      {
        logger: this.#logger,
        pathManager: this.#pathManager.dir([
          { context: creatorId, required: true },
        ]),
      },
      creatorId,
    );
    this.#manifests.set(creatorId, manifest);
    return manifest;
  }
}

function hasFailedPost(manifest: CreatorManifest): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
