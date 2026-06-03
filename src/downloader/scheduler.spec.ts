import { describe, expect, it } from "vitest";

import { RequestScheduler } from "./scheduler.js";

describe("RequestScheduler", () => {
  it("limits concurrent operations", async () => {
    let active = 0;
    let maximumActive = 0;
    const scheduler = new RequestScheduler({ concurrency: 2 });
    const operations = Array.from({ length: 4 }, () =>
      scheduler.run(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      }),
    );

    await Promise.all(operations);

    expect(maximumActive).toBe(2);
  });

  it("retries rate limited responses after the configured pause", async () => {
    const sleeps: number[] = [];
    const events: string[] = [];
    let attempts = 0;
    let now = 0;
    const scheduler = new RequestScheduler({
      concurrency: 1,
      logger: {
        error: () => undefined,
        info: () => undefined,
        warn: (event) => {
          events.push(event);
        },
      },
      now: () => now,
      rateLimitPauseMs: 60_000,
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
        return Promise.resolve();
      },
    });

    const response = await scheduler.fetch("https://example.test", () => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? new Response("", {
              headers: { "Retry-After": "2" },
              status: 429,
            })
          : new Response("ok", { status: 200 }),
      );
    });

    expect(await response.text()).toBe("ok");
    expect(attempts).toBe(2);
    expect(sleeps).toContain(2_000);
    expect(events).toEqual(["request.rate-limit.pause", "request.retry"]);
  });

  it("does not retry a non-rate-limited client error", async () => {
    let attempts = 0;
    const scheduler = new RequestScheduler({ concurrency: 1 });

    const response = await scheduler.fetch("https://example.test", () => {
      attempts += 1;
      return Promise.resolve(new Response("", { status: 404 }));
    });

    expect(response.status).toBe(404);
    expect(attempts).toBe(1);
  });
});
