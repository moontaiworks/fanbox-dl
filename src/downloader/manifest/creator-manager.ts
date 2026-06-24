import type { PathManager } from "../path-manager.js";
import { CreatorManifest } from "./creator.js";

export interface CreatorManifestManagerOptions {
  pathManager: PathManager;
}

export class CreatorManifestManager {
  #manifests = new Map<string, CreatorManifest>();
  #pathManager: PathManager;

  constructor(options: CreatorManifestManagerOptions) {
    this.#pathManager = options.pathManager;
  }

  async load(creatorId: string): Promise<CreatorManifest> {
    const manifest =
      this.#manifests.get(creatorId) ?? this.#createManifest(creatorId);

    await manifest.load();

    return manifest;
  }

  async saveAll(): Promise<void> {
    const manifests = Array.from(this.#manifests.values());
    await Promise.all(manifests.map((manifest) => manifest.save()));
  }

  #createManifest(creatorId: string): CreatorManifest {
    const manifest = new CreatorManifest(
      { pathManager: this.#pathManager.dir(creatorId) },
      creatorId,
    );
    this.#manifests.set(creatorId, manifest);
    return manifest;
  }
}
