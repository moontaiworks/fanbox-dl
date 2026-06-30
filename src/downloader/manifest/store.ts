import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isNotFoundError } from "../fs/filesystem.js";

export interface Store<T> {
  load(path: string): Promise<null | T>;
  save(path: string, data: T): Promise<void>;
}

export class FileSystemStore<T> implements Store<T> {
  async load(path: string): Promise<null | T> {
    try {
      const content = await readFile(path, "utf8");
      return JSON.parse(content) as T;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async save(path: string, data: T): Promise<void> {
    await mkdir(dirname(path), { recursive: true });

    const randomSuffix = Math.floor(Math.random() * 1000000);
    const tempPath = `${path}.tmp.${randomSuffix}`;
    const content = `${JSON.stringify(data, null, 2)}\n`;

    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, path);
  }
}
