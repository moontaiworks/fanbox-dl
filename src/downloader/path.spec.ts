import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPathBudget,
  createCreatorDirectoryName,
  createPostDirectoryName,
  sanitizePathComponent,
  sanitizePathComponentForDirectory,
} from "./path.js";

describe("sanitizePathComponent", () => {
  it("removes invalid characters and protects Windows reserved names", () => {
    expect(sanitizePathComponent('CON<>:"/\\|?*. ')).toBe("_CON_________");
  });

  it("truncates UTF-8 components without breaking their suffix", () => {
    const value = sanitizePathComponent("界".repeat(100), {
      maxBytes: 20,
      suffix: "_123.png",
    });

    expect(Buffer.byteLength(value)).toBeLessThanOrEqual(20);
    expect(value.endsWith("_123.png")).toBe(true);
  });

  it("truncates a component to fit its absolute directory path", () => {
    const directory = path.resolve("/tmp", "nested");
    const value = sanitizePathComponentForDirectory(
      "x".repeat(300),
      directory,
      {
        suffix: ".png",
      },
    );

    expect(Buffer.byteLength(path.join(directory, value))).toBeLessThanOrEqual(
      240,
    );
    expect(value.endsWith(".png")).toBe(true);
  });
});

describe("createCreatorDirectoryName", () => {
  it("keeps creator IDs inside a single safe path component", () => {
    expect(createCreatorDirectoryName("../creator", "/tmp")).toBe(".._creator");
  });
});

describe("createPostDirectoryName", () => {
  it("includes the publish date, post ID, and readable title", () => {
    expect(
      createPostDirectoryName({
        id: "123",
        publishedDatetime: "2026-05-27T21:17:41+09:00",
        title: "A title",
      }),
    ).toBe("2026-05-27_123_A title");
  });
});

describe("assertPathBudget", () => {
  it("rejects an absolute path longer than the configured budget", () => {
    expect(() => {
      assertPathBudget(path.resolve("/tmp", "x".repeat(300)), 240);
    }).toThrow(/path budget/i);
  });
});
