import { logger } from "../logger.js";
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
  #queue: (() => void)[] = [];

  constructor(private concurrency: number) {}

  async acquire() {
    if (this.#active >= this.concurrency) {
      logger.debug("request.concurrent.pending", undefined, {
        active: this.#active,
        concurrency: this.concurrency,
      });
      await new Promise<void>((release) => this.#queue.push(release));
    }

    ++this.#active;
    logger.debug("request.concurrent.passed", undefined, {
      active: this.#active,
      concurrency: this.concurrency,
    });
  }

  release() {
    --this.#active;
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (next) next();
    }
  }
}

class TimeLimiter {
  #availableAt = 0;

  constructor(private intervalMs: number) {}

  setNextAvailableAt(availableAt: number) {
    this.#availableAt = availableAt;
  }

  async wait() {
    const now = Date.now();
    if (this.#availableAt > now) {
      const waitMs = this.#availableAt - now;
      logger.debug("request.pending", undefined, {
        availableAt: this.#availableAt,
        now,
        waitMs,
      });
      await sleep(waitMs);
    }

    this.#availableAt = Date.now() + this.intervalMs;
  }
}

export class RequestWorker {
  #concurrencyLimiter: ConcurrencyLimiter;
  #maxRetries: number;
  #rateLimitPauseMs?: number;
  #timeLimiter: TimeLimiter;
  #transport: HttpTransport;

  constructor({
    concurrency = 5,
    intervalMs = 500,
    maxRetries = 3,
    rateLimitPauseMs,
    transport = new Http2Transport(),
  }: RequestQueueOptions = {}) {
    this.#transport = transport;
    this.#concurrencyLimiter = new ConcurrencyLimiter(concurrency);
    this.#timeLimiter = new TimeLimiter(intervalMs);
    this.#maxRetries = maxRetries;
    this.#rateLimitPauseMs = rateLimitPauseMs;
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
    await this.#timeLimiter.wait();

    const requestObj =
      request instanceof Request ? request.clone() : new Request(request);
    const response = await this.#transport.fetch(requestObj);
    if (response.ok) return response;

    logger.warn("request.error", undefined, {
      retryRemains,
      status: response.status,
      url: requestObj.url,
    });

    if (response.status === 429) {
      const retryAfter =
        this.#rateLimitPauseMs ?? parseRetryAfter(response) ?? 60_000;
      const availableAt = Date.now() + retryAfter;
      this.#timeLimiter.setNextAvailableAt(availableAt);
      logger.warn(
        "request.rate-limit",
        "Rate limit reached, pausing requests",
        { availableAt, retryAfter },
      );
    }

    if (retryRemains <= 0) {
      logger.error("request.failed", "Request failed after maximum retries");
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
