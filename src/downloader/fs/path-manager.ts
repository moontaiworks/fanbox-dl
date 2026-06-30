import { basename, dirname, join, resolve } from "node:path";

import type { Post } from "../../client/types.js";

interface PathManagerOptions {
  flatPosts: boolean;
  rootPath: string;
}

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
    const fileName = `${index}-${name}.${extension}`;

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
    const title = `${date}-${post.id}-${post.title}`;

    return this.dir(title);
  }
}
