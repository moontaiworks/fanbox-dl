import { parseDownloadOptions } from "../../../src/downloader/cli/options.js";

describe("parseDownloadOptions", () => {
  it("defaults HTTP/2 session multiplier to 10", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
    ]);

    expect(options.http2SessionMultiplier).toBe(10);
  });

  it("parses the configured HTTP/2 session multiplier", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
      "--http2-session-multiplier",
      "3",
    ]);

    expect(options.http2SessionMultiplier).toBe(3);
  });

  it("defaults max filename bytes to 250", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
    ]);

    expect(options.maxFilenameBytes).toBe(250);
  });

  it("defaults flat parent min bytes to 3", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
    ]);

    expect(options.flatParentMinBytes).toBe(3);
  });

  it("parses the configured max filename bytes", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
      "--max-filename-bytes",
      "200",
    ]);

    expect(options.maxFilenameBytes).toBe(200);
  });

  it("parses the configured flat parent min bytes", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
      "--flat-parent-min-bytes",
      "35",
    ]);

    expect(options.flatParentMinBytes).toBe(35);
  });
});

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;
