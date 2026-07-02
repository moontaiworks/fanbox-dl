import { basename, dirname, join, resolve } from "node:path";

import type { Post } from "../../client/types.js";

interface PathManagerOptions {
  flatPosts: boolean;
  rootPath: string;
}

// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export class PathManager {
  name: string;
  path: string;
  #flatPosts: boolean;

  constructor({ flatPosts, rootPath }: PathManagerOptions) {
    this.path = resolve(rootPath);
    this.#flatPosts = flatPosts;
    this.name = basename(this.path);
  }

  asset(index: string, name: string, extension: string) {
    const sanitizedName = name.replace(INVALID_FILENAME_CHARS, "-");
    const fileName = `${index}-${sanitizedName}.${extension}`;

    if (this.#flatPosts) {
      const parent = dirname(this.path);
      return join(parent, `${this.name}.${fileName}`);
    }

    return join(this.path, fileName);
  }

  dir(name: string) {
    return new PathManager({
      flatPosts: this.#flatPosts,
      rootPath: join(this.path, name),
    });
  }

  file(name: string) {
    return join(this.path, name);
  }

  post(post: Pick<Post, "id" | "publishedDatetime" | "title">) {
    const date = post.publishedDatetime.split("T")[0];
    const sanitizedTitle = post.title.replace(INVALID_FILENAME_CHARS, "-");
    const title = `${date}-${post.id}-${sanitizedTitle}`;

    return this.dir(title);
  }
}
