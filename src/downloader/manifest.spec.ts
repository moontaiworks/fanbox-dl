import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ManifestStore } from "./manifest.js";

describe("ManifestStore", () => {
  it("creates and atomically persists a creator manifest", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-manifest-"));
    const store = new ManifestStore(directory, "creator");
    const manifest = await store.load();
    manifest.posts["123"] = {
      assets: {},
      directory: "posts/123",
      id: "123",
      restricted: false,
      status: "complete",
      updatedDatetime: "2026-05-27T21:17:41+09:00",
    };

    await store.save(manifest);

    await expect(
      readFile(path.join(directory, "creator", "manifest.json.tmp"), "utf8"),
    ).rejects.toThrow();
    await expect(store.load()).resolves.toEqual(manifest);
  });
});
