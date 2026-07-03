import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";

import { exists, filesize } from "../../../src/downloader/fs/filesystem.js";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

describe("filesystem", () => {
  const statMock = vi.mocked(stat);

  beforeEach(() => {
    statMock.mockReset();
  });

  describe("exists", () => {
    it("returns false when the path does not exist", async () => {
      statMock.mockRejectedValueOnce(createNodeError("ENOENT"));

      await expect(exists("missing")).resolves.toBe(false);
    });

    it("throws when stat fails for reasons other than missing paths", async () => {
      const error = createNodeError("EACCES");
      statMock.mockRejectedValueOnce(error);

      await expect(exists("restricted")).rejects.toBe(error);
    });
  });

  describe("filesize", () => {
    it("returns size 0 when the path does not exist", async () => {
      statMock.mockRejectedValueOnce(createNodeError("ENOENT"));

      await expect(filesize("missing")).resolves.toEqual({ size: 0 });
    });

    it("throws when stat fails for reasons other than missing paths", async () => {
      const error = createNodeError("EACCES");
      statMock.mockRejectedValueOnce(error);

      await expect(filesize("restricted")).rejects.toBe(error);
    });

    it("returns the stat result when the path exists", async () => {
      statMock.mockResolvedValueOnce({ size: 123 } as Stats);

      await expect(filesize("asset.jpg")).resolves.toMatchObject({
        size: 123,
      });
    });
  });
});

function createNodeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
