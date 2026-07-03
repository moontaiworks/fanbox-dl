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

export function isNotFoundError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
