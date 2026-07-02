import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { PathManager } from "../../../src/downloader/fs/path-manager.js";

describe("PathManager", () => {
  it("generates asset paths whose .part temp filename can be written", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({ flatPosts: false, rootPath });
    const destination = pathManager.asset("000", "檔".repeat(100), "jpg");
    const tempPath = `${destination}.part`;
    console.debug(tempPath);

    expect(basename(tempPath)).toBe(`000-${"檔".repeat(78)}⋯.jpg.part`);
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(255);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves the flat parent marker when only the asset filename is too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      maxFilenameBytes: 80,
      rootPath,
    }).dir("post");
    const destination = pathManager.asset("000", "檔".repeat(80), "png");
    const tempPath = `${destination}.part`;
    console.debug(tempPath);

    expect(basename(tempPath)).toBe(`${"⋯.000-" + "檔".repeat(20)}⋯.png.part`);
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(80);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves the full flat asset filename when only the parent directory is too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      maxFilenameBytes: 80,
      rootPath,
    }).dir("名".repeat(80));
    const destination = pathManager.asset("000", "file", "png");
    const tempPath = `${destination}.part`;
    console.debug(tempPath);

    expect(basename(tempPath)).toBe(`${"名".repeat(19)}⋯.000-file.png.part`);
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(80);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves the flat parent marker when both the parent directory and asset filename are too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: true,
      maxFilenameBytes: 200,
      rootPath,
    }).dir("名".repeat(80));
    const destination = pathManager.asset("000", "檔".repeat(80), "png");
    const tempPath = `${destination}.part`;
    console.debug(tempPath);

    expect(basename(tempPath)).toBe(`${"⋯.000-" + "檔".repeat(60)}⋯.png.part`);
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(200);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("preserves configured flat parent bytes when both the parent directory and asset filename are too long", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatParentMinBytes: 50,
      flatPosts: true,
      maxFilenameBytes: 200,
      rootPath,
    }).dir("2026-03-05-20180801-" + "名".repeat(80));
    const destination = pathManager.asset("000", "檔".repeat(80), "png");
    const tempPath = `${destination}.part`;
    console.debug(tempPath);

    expect(basename(tempPath)).toBe(
      `${"2026-03-05-20180801-" + "名".repeat(9)}⋯.000-${"檔".repeat(44)}⋯.png.part`,
    );
    expect(Buffer.byteLength(basename(tempPath))).toBeLessThanOrEqual(200);
    await expect(writeFile(tempPath, "ok")).resolves.toBeUndefined();
  });

  it("fails to write .part temp files when max filename bytes exceeds the filesystem limit by one", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-path-"));
    const pathManager = new PathManager({
      flatPosts: false,
      maxFilenameBytes: 256,
      rootPath,
    });
    const destination = pathManager.asset("000", "a".repeat(300), "jpg");
    const tempPath = `${destination}.part`;
    console.debug(tempPath);

    expect(Buffer.byteLength(basename(tempPath))).toBe(256);
    await expect(writeFile(tempPath, "ok")).rejects.toMatchObject({
      code: "ENAMETOOLONG",
    });
  });
});
