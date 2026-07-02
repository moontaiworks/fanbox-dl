const { http2TransportOptions } = vi.hoisted(() => ({
  http2TransportOptions: [] as unknown[],
}));

vi.mock("../../src/transport/http2.js", () => ({
  Http2Transport: vi.fn(function Http2Transport(options: unknown) {
    http2TransportOptions.push(options);

    return {
      fetch: vi.fn(async () =>
        Promise.resolve(new Response(null, { status: 200 })),
      ),
    };
  }),
}));

import { RequestWorker } from "../../src/transport/worker.js";

describe("RequestWorker transport defaults", () => {
  beforeEach(() => {
    http2TransportOptions.length = 0;
  });

  it("uses five HTTP/2 sessions per configured request concurrency", () => {
    new RequestWorker(
      { logger: silentLogger },
      { concurrency: 7, intervalMs: 0 },
    );

    expect(http2TransportOptions).toEqual([{ sessionsPerOrigin: 35 }]);
  });
});

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;
