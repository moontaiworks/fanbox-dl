import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export async function exists(filePath: string): Promise<boolean> {
  return stat(filePath)
    .then(() => true)
    .catch((error: unknown) => {
      if (isNotFoundError(error)) return false;

      throw error;
    });
}

export async function filesize(path: string) {
  return stat(path).catch((error: unknown) => {
    if (isNotFoundError(error)) return { size: 0 };

    throw error;
  });
}

export function formatFileTimestamp(timestamp: Date): string {
  return normalizeFileTimestamp(timestamp).toISOString();
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(filePath))
    hash.update(chunk as Buffer);

  return hash.digest("hex");
}

export function isNotFoundError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

export function normalizeFileTimestamp(timestamp: Date): Date {
  return new Date(Math.trunc(timestamp.getTime() / 1_000) * 1_000);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
