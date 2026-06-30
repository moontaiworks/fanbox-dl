import type { Logger } from "pino";

import { Http2Transport, type HttpTransport } from "./http2.js";

export interface RequestQueueOptions {
  concurrency?: number;
  intervalMs?: number;
  maxRetries?: number;
  rateLimitPauseMs?: number;
  transport?: HttpTransport;
}

class ConcurrencyLimiter {
  #active = 0;
  #logger: Logger;
  #queue: (() => void)[] = [];

  constructor(
    { logger }: { logger: Logger },
    private concurrency: number,
  ) {
    this.#logger = logger;
    this.#logger.trace({ concurrency }, "Initialized ConcurrencyLimiter");
  }

  async acquire() {
    if (this.#active >= this.concurrency) {
      this.#logger.trace(
        `Concurrency limit reached (${this.#active}/${this.concurrency}), waiting for release.`,
      );
      await new Promise<void>((release) => this.#queue.push(release));
    }

    ++this.#active;
  }

  release() {
    --this.#active;
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (next) {
        this.#logger.trace(
          `Concurrency limit released (${this.#active}/${this.concurrency}), processing next request.`,
        );
        next();
      }
    }
  }
}

class TimeLimiter {
  #availableAt = 0;
  #logger: Logger;

  constructor(
    { logger }: { logger: Logger },
    private intervalMs: number,
  ) {
    this.#logger = logger;
    this.#logger.trace(`Initialized TimeLimiter with interval ${intervalMs}ms`);
  }

  setNextAvailableAt(availableAt: number) {
    this.#logger.trace(
      `Setting next available time to ${new Date(availableAt).toISOString()}.`,
    );
    this.#availableAt = availableAt;
  }

  async wait() {
    const now = Date.now();
    if (this.#availableAt > now) {
      const waitMs = this.#availableAt - now;
      this.#logger.trace(
        `Waiting for time limiter for ${waitMs}ms, until ${new Date(this.#availableAt).toISOString()}.`,
      );
      await sleep(waitMs);
      this.#logger.trace(
        `Time limiter continued at ${new Date(this.#availableAt).toISOString()}.`,
      );
    }

    this.setNextAvailableAt(Date.now() + this.intervalMs);
  }
}

export class RequestWorker {
  #concurrencyLimiter: ConcurrencyLimiter;
  #logger: Logger;
  #maxRetries: number;
  #rateLimitPauseMs?: number;
  #timeLimiter: TimeLimiter;
  #transport: HttpTransport;

  constructor(
    { logger }: { logger: Logger },
    {
      concurrency = 5,
      intervalMs = 500,
      maxRetries = 3,
      rateLimitPauseMs,
      transport = new Http2Transport(),
    }: RequestQueueOptions = {},
  ) {
    this.#logger = logger;
    this.#transport = transport;
    this.#concurrencyLimiter = new ConcurrencyLimiter({ logger }, concurrency);
    this.#timeLimiter = new TimeLimiter({ logger }, intervalMs);
    this.#maxRetries = maxRetries;
    this.#rateLimitPauseMs = rateLimitPauseMs;
    logger.trace(
      {
        concurrency,
        intervalMs,
        maxRetries,
        rateLimitPauseMs,
        transport: transport.constructor.name,
      },
      "Initialized RequestWorker",
    );
  }

  async fetch(request: Request | string | URL) {
    await this.#concurrencyLimiter.acquire();

    return this.#fetch(request).finally(() => {
      this.#concurrencyLimiter.release();
    });
  }

  async #fetch(
    request: Request | string | URL,
    retryRemains = this.#maxRetries,
  ): Promise<Response> {
    this.#logger.info(
      `Fetching request with max ${retryRemains} retries to ${request instanceof Request ? request.url : request.toString()}`,
    );
    await this.#timeLimiter.wait();

    const requestObj =
      request instanceof Request ? request.clone() : new Request(request);
    const response = await this.#transport.fetch(requestObj);
    if (response.ok) return response;

    if (response.status === 429) {
      const retryAfter =
        this.#rateLimitPauseMs ?? parseRetryAfter(response) ?? 60_000;
      const availableAt = Date.now() + retryAfter;
      this.#logger.warn(
        `Received 429 Too Many Requests. Pausing requests until ${new Date(availableAt).toISOString()}.`,
      );
      await sleep(retryAfter);
      this.#timeLimiter.setNextAvailableAt(availableAt);
    }

    if (retryRemains <= 0) {
      const url = request instanceof Request ? request.url : request.toString();
      this.#logger.error(
        `Request to ${url} failed with ${response.status} ${response.statusText} after maximum retries.`,
      );
      return response;
    }

    return this.#fetch(request, retryRemains - 1);
  }
}

function parseRetryAfter(
  response: Response,
  now = Date.now(),
): number | undefined {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(retryAfter);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
