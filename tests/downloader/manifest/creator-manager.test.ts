import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PathManager } from "../../../src/downloader/fs/path-manager.js";
import { CreatorManifestManager } from "../../../src/downloader/manifest/creator-manager.js";

describe("CreatorManifestManager", () => {
  it("throws a readable error when marking a creator that was not loaded", async () => {
    const manager = new CreatorManifestManager({
      logger: silentLogger,
      pathManager: new PathManager({
        flatPosts: false,
        rootPath: await mkdtemp(join(tmpdir(), "fanbox-dl-manifest-")),
      }),
    });

    expect(() => {
      manager.markFailed("creator-1", new Error("failed"));
    }).toThrow("Creator manifest creator-1 has not been loaded");
    expect(() => {
      manager.markSucceeded("creator-1");
    }).toThrow("Creator manifest creator-1 has not been loaded");
  });
});

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;
