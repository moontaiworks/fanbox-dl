import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { PathManager } from "../../../src/downloader/fs/path-manager.js";

describe("PathManager", () => {
  it("truncates optional asset filename segments while preserving required segments", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({ flatPosts: false, rootPath });
    const destination = pathManager.asset(
      [
        { context: "000", required: true },
        { context: "檔".repeat(100), required: false },
        { context: "asset-id", required: true },
      ],
      "jpg",
    );
    const tempPath = `${destination}.part`;

    expect(basename(tempPath)).toBe(
      `000-${"檔".repeat(75)}⋯-asset-id.jpg.part`,
    );
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(255);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves the flat parent when only the asset filename is too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      rootPath,
    }).dir([{ context: "post", required: true }]);
    const destination = pathManager.asset(
      [
        { context: "000", required: true },
        { context: "檔".repeat(100), required: false },
      ],
      "png",
    );
    const tempPath = `${destination}.part`;

    expect(basename(tempPath)).toBe(`post.000-${"檔".repeat(76)}⋯.png.part`);
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(255);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves the full flat asset filename when only the parent directory is too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      rootPath,
    }).dir([{ context: "名".repeat(80), required: false }]);
    const destination = pathManager.asset(
      [
        { context: "000", required: true },
        { context: "file", required: false },
      ],
      "png",
    );
    const tempPath = `${destination}.part`;

    expect(basename(tempPath)).toBe(`${"名".repeat(76)}⋯.000-file.png.part`);
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(255);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves required flat asset segments when both the parent directory and optional filename segments are too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      rootPath,
    }).dir([{ context: "名".repeat(80), required: false }]);
    const destination = pathManager.asset(
      [
        { context: "000", required: true },
        { context: "檔".repeat(100), required: false },
        { context: "asset-id", required: true },
      ],
      "png",
    );
    const tempPath = `${destination}.part`;

    expect(basename(tempPath)).toBe(
      `⋯.000-${"檔".repeat(73)}⋯-asset-id.png.part`,
    );
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(255);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("fails to write .part temp files when required segments exceed the filesystem limit", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: false,
      rootPath,
    });
    const destination = pathManager.asset(
      [{ context: "測".repeat(83), required: true }],
      "jpg",
    );
    const tempPath = `${destination}.part`;

    expect(Buffer.byteLength(basename(tempPath))).toBeGreaterThan(255);
    await expect(writeFile(tempPath, "ok")).rejects.toMatchObject({
      code: "ENAMETOOLONG",
    });
  });

  it("truncates optional flat parent segments while preserving required parent segments", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      rootPath,
    }).dir([
      { context: "2026-03-05", required: true },
      { context: "20180801", required: true },
      { context: "名".repeat(80), required: false },
    ]);
    const destination = pathManager.asset(
      [
        { context: "000", required: true },
        { context: "檔".repeat(100), required: false },
        { context: "asset-id", required: true },
      ],
      "png",
    );
    const tempPath = `${destination}.part`;

    expect(basename(tempPath)).toBe(
      `2026-03-05-20180801-⋯.000-${"檔".repeat(67)}⋯-asset-id.png.part`,
    );
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(255);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });
});
