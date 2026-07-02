import type { HttpTransport } from "../../src/transport/http2.js";
import { RequestWorker } from "../../src/transport/worker.js";

describe("RequestWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not exceed the configured transport concurrency", async () => {
    const transport = new RecordingTransport(100);
    const worker = new RequestWorker(
      { logger: silentLogger },
      { concurrency: 2, intervalMs: 0, transport },
    );

    const requests = Promise.all([
      worker.fetch("https://example.com/1"),
      worker.fetch("https://example.com/2"),
      worker.fetch("https://example.com/3"),
      worker.fetch("https://example.com/4"),
      worker.fetch("https://example.com/5"),
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    await requests;

    expect(transport.maxActive).toBe(2);
  });

  it("spaces request starts when multiple fetches are queued at once", async () => {
    const transport = new RecordingTransport(10);
    const worker = new RequestWorker(
      { logger: silentLogger },
      { concurrency: 3, intervalMs: 100, transport },
    );

    const requests = Promise.all([
      worker.fetch("https://example.com/1"),
      worker.fetch("https://example.com/2"),
      worker.fetch("https://example.com/3"),
      worker.fetch("https://example.com/4"),
      worker.fetch("https://example.com/5"),
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    await requests;

    expect(transport.startedAt).toEqual([0, 100, 200, 300, 400]);
  });
});

class RecordingTransport implements HttpTransport {
  active = 0;
  maxActive = 0;
  startedAt: number[] = [];

  constructor(private responseDelayMs: number) {}

  async fetch() {
    this.startedAt.push(Date.now());
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    await sleep(this.responseDelayMs);
    this.active -= 1;
    return new Response(null, { status: 200 });
  }
}

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
