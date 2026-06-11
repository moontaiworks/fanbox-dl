import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import type { HttpResponse } from "../http.js";
import { logger } from "../logger.js";
import { RequestScheduler } from "./scheduler.js";

function captureLogs(
  entries: unknown[],
  level: "debug" | "warn" = "debug",
): void {
  logger.configure({
    level,
    write: (line) => entries.push(JSON.parse(line) as unknown),
  });
}

function response(
  body: unknown,
  init: { headers?: Headers | Record<string, string>; status?: number } = {},
): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const status = init.status ?? 200;

  return {
    body: Readable.from([text]),
    headers: new Headers(init.headers),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: () => Promise.resolve(text),
  };
}

describe("RequestScheduler", () => {
  afterEach(() => {
    logger.configure({ level: "silent", write: () => undefined });
  });

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
    const entries: unknown[] = [];
    let attempts = 0;
    let now = 0;
    captureLogs(entries, "warn");
    const scheduler = new RequestScheduler({
      concurrency: 1,
      now: () => now,
      rateLimitPauseMs: 60_000,
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
        return Promise.resolve();
      },
    });

    const result = await scheduler.request(() => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? response("", {
              headers: { "Retry-After": "2" },
              status: 429,
            })
          : response("ok", { status: 200 }),
      );
    });

    expect(await result.text()).toBe("ok");
    expect(attempts).toBe(2);
    expect(sleeps).toContain(2_000);
    const events = entries.map((entry) =>
      typeof entry === "object" && entry !== null && "event" in entry
        ? entry.event
        : undefined,
    );
    expect(events).toEqual(["request.rate-limit.pause", "request.retry"]);
  });

  it("does not retry a non-rate-limited client error", async () => {
    let attempts = 0;
    const scheduler = new RequestScheduler({ concurrency: 1 });

    const result = await scheduler.request(() => {
      attempts += 1;
      return Promise.resolve(response("", { status: 404 }));
    });

    expect(result.status).toBe(404);
    expect(attempts).toBe(1);
  });

  it("debug logs retryable response bodies before retrying", async () => {
    const entries: unknown[] = [];
    let attempts = 0;
    captureLogs(entries);
    const scheduler = new RequestScheduler({
      concurrency: 1,
      maxRetries: 1,
    });

    const result = await scheduler.request(() => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? response({ error: "try again" }, { status: 500 })
          : response("ok", { status: 200 }),
      );
    });

    expect(await result.text()).toBe("ok");
    expect(entries).toContainEqual(
      expect.objectContaining({
        body: { error: "try again" },
        event: "api.response.error",
        status: 500,
      }),
    );
  });
});
