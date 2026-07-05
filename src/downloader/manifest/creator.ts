import type { Logger } from "pino";

import type { PathManager } from "../fs/path-manager.js";
import { FileSystemStore, type Store } from "./store.js";

export interface AssetManifestData {
  bytes?: number;
  contentIndex?: number;
  error?: string;
  path: string;
  sha256?: string;
  status: AssetStatus;
  url: string;
}

export interface CreatorManifestData {
  creatorId: string;
  error?: string;
  posts: Partial<Record<string, PostManifestData>>;
  version: 1;
}

export interface PostManifestData {
  assets: Partial<Record<string, AssetManifestData>>;
  error?: string;
  id: string;
  restricted: boolean;
  status: PostStatus;
  updatedDatetime: string;
}

type AssetStatus = "complete" | "failed" | "obsolete" | "pending";

interface CreatorManifestDeps {
  logger: Logger;
  pathManager: PathManager;
  store?: Store<CreatorManifestData>;
}

type PostStatus = "complete" | "failed" | "partial" | "pending" | "skipped";

export class CreatorManifest implements CreatorManifestData {
  readonly version = 1 as const;
  get error() {
    return this.#data.error;
  }

  get posts() {
    return this.#data.posts;
  }

  #data: CreatorManifestData;
  #loaded = false;
  #logger: Logger;
  #manifestPath: string;
  #store: Store<CreatorManifestData>;

  constructor(
    options: CreatorManifestDeps,
    public readonly creatorId: string,
  ) {
    this.#logger = options.logger;
    this.#manifestPath = options.pathManager.file("manifest.json");
    this.#store = options.store ?? new FileSystemStore<CreatorManifestData>();

    this.#data = { creatorId, posts: {}, version: 1 };
  }

  async load(): Promise<void> {
    if (this.#loaded) return;
    this.#logger.trace(
      `Loading creator manifest for ${this.creatorId} from ${this.#manifestPath}`,
    );

    this.#loaded = true;

    const data = await this.#store.load(this.#manifestPath);

    this.#data = data ?? { creatorId: this.creatorId, posts: {}, version: 1 };
  }

  markFailed(error: unknown): void {
    this.#data.error = String(error);
  }

  markSucceeded(): void {
    delete this.#data.error;
  }

  async save(): Promise<void> {
    const posts = Object.values(this.#data.posts);
    if (
      !this.#data.error &&
      (!posts.length || posts.every((post) => post?.status !== "complete"))
    ) {
      // If there are no posts, we don't need to save the manifest.
      this.#logger.trace(
        `No posts in creator manifest for ${this.creatorId}, skipping save.`,
      );
      return;
    }

    this.#logger.trace(
      `Saving creator manifest for ${this.creatorId} to ${this.#manifestPath}`,
    );
    await this.#store.save(this.#manifestPath, this.#data);
  }
}
