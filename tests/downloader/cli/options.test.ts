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
});

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;
