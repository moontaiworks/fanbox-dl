import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(path: string, data: T): Promise<void> {
    await mkdir(dirname(path), { recursive: true });

    const tempPath = `${path}.tmp`;
    const content = `${JSON.stringify(data, null, 2)}\n`;

    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, path);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
