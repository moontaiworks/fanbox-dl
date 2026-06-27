import type { PathManager } from "../fs/path-manager.js";
import { FileSystemStore, type Store } from "./store.js";

export interface AssetManifestData {
  bytes?: number;
  error?: string;
  path: string;
  sha256?: string;
  status: AssetStatus;
  url: string;
}

export interface CreatorManifestData {
  creatorId: string;
  posts: Partial<Record<string, PostManifestData>>;
  version: 1;
}

export interface PostManifestData {
  assets: Partial<Record<string, AssetManifestData>>;
  directory: string;
  error?: string;
  id: string;
  restricted: boolean;
  status: PostStatus;
  updatedDatetime: string;
}

type AssetStatus =
  | "complete"
  | "downloading"
  | "failed"
  | "obsolete"
  | "pending";

interface CreatorManifestOptions {
  pathManager: PathManager;
  store?: Store<CreatorManifestData>;
}

type PostStatus = "complete" | "failed" | "pending" | "skipped";

export class CreatorManifest implements CreatorManifestData {
  readonly version = 1 as const;
  get posts() {
    return this.#data.posts;
  }

  #data: CreatorManifestData;
  #loaded = false;
  #manifestPath: string;

  #store: Store<CreatorManifestData>;

  constructor(
    options: CreatorManifestOptions,
    public readonly creatorId: string,
  ) {
    this.#manifestPath = options.pathManager.file("manifest.json");
    this.#store = options.store ?? new FileSystemStore<CreatorManifestData>();

    this.#data = { creatorId, posts: {}, version: 1 };
  }

  async load(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;

    const data = await this.#store.load(this.#manifestPath);

    this.#data = data ?? { creatorId: this.creatorId, posts: {}, version: 1 };
  }

  async save(): Promise<void> {
    const posts = Object.values(this.#data.posts);
    if (!posts.length || posts.every((post) => post?.status !== "complete")) {
      // If there are no posts, we don't need to save the manifest.
      return;
    }

    await this.#store.save(this.#manifestPath, this.#data);
  }
}
