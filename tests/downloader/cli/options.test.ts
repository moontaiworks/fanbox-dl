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

  it("defaults max filename bytes to 256", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
    ]);

    expect(options.maxFilenameBytes).toBe(256);
  });

  it("defaults flat parent min bytes to 35", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
    ]);

    expect(options.flatParentMinBytes).toBe(35);
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
      "50",
    ]);

    expect(options.flatParentMinBytes).toBe(50);
  });

  it("defaults verify to false", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
    ]);

    expect(options.verify).toBe(false);
  });

  it("parses verify", () => {
    const options = parseDownloadOptions({ logger: silentLogger }, [
      "--creator",
      "example",
      "--verify",
    ]);

    expect(options.verify).toBe(true);
  });
});

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;
