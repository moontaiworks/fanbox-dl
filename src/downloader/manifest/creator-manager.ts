import { resolve } from "node:path";

import { CreatorManifest } from "./creator.js";

export interface CreatorManifestManagerOptions {
  rootPath: string;
}

export class CreatorManifestManager {
  #manifests = new Map<string, CreatorManifest>();
  #rootPath: string;

  constructor(options: CreatorManifestManagerOptions) {
    this.#rootPath = resolve(options.rootPath);
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
      { rootPath: this.#rootPath },
      creatorId,
    );
    this.#manifests.set(creatorId, manifest);
    return manifest;
  }
}
