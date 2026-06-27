import { join, resolve } from "node:path";

interface PathManagerOptions {
  rootPath: string;
}

export class PathManager {
  #rootPath: string;

  constructor({ rootPath }: PathManagerOptions) {
    this.#rootPath = resolve(rootPath);
  }

  dir(name: string) {
    return new PathManager({ rootPath: join(this.#rootPath, name) });
  }

  file(name: string) {
    return join(this.#rootPath, name);
  }
}
