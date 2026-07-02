import type { Logger } from "pino";

import { Http2Transport, type HttpTransport } from "./http2.js";

export interface RequestQueueOptions {
  concurrency?: number;
  intervalMs?: number;
  maxRetries?: number;
  rateLimitPauseMs?: number;
  transport?: HttpTransport;
}

interface PendingRequest {
  reject: (reason?: unknown) => void;
  request: Request | string | URL;
  resolve: (response: Response) => void;
}

class ConcurrentLimiter {
  get activeRequests() {
    return this.#activeRequests;
  }

  #activeRequests = 0;
  #logger: Logger;

  constructor(
    { logger }: { logger: Logger },
    public readonly concurrency: number,
  ) {
    this.#logger = logger;
    this.#logger.trace(
      `Initialized ConcurrentLimiter with max ${concurrency} concurrent requests`,
    );
  }

  acquire() {
    if (!this.canAcquire()) return false;

    this.#activeRequests += 1;
    return true;
  }

  canAcquire() {
    if (this.#activeRequests < this.concurrency) return true;

    this.#logger.trace(
      `Concurrency limit reached (${this.#activeRequests}/${this.concurrency}), dropping new concurrent request.`,
    );
    return false;
  }

  release() {
    this.#activeRequests -= 1;
  }
}

class TimeRateLimiter {
  get nextAvailableAt() {
    return this.#nextAvailableAt;
  }

  #logger: Logger;
  #nextAvailableAt = 0;

  constructor(
    { logger }: { logger: Logger },
    private intervalMs: number,
  ) {
    this.#logger = logger;
    this.#logger.trace(
      `Initialized TimeRateLimiter with interval ${intervalMs}ms`,
    );
  }

  postponeUntil(availableAt: number) {
    this.#nextAvailableAt = Math.max(this.#nextAvailableAt, availableAt);
    this.#logger.trace(
      `Setting next available time to ${new Date(this.#nextAvailableAt).toISOString()}.`,
    );
  }

  reserveNextStart() {
    this.#nextAvailableAt =
      Math.max(this.#nextAvailableAt, Date.now()) + this.intervalMs;
    this.#logger.trace(
      `Setting next available time to ${new Date(this.#nextAvailableAt).toISOString()}.`,
    );
  }

  waitMs() {
    return this.#nextAvailableAt - Date.now();
  }
}

export class RequestWorker {
  #concurrentLimiter: ConcurrentLimiter;
  #logger: Logger;
  #maxRetries: number;
  #pendingRequests: PendingRequest[] = [];
  #rateLimitPauseMs?: number;
  #scheduledPump?: ReturnType<typeof setTimeout>;
  #timeRateLimiter: TimeRateLimiter;
  #transport: HttpTransport;

  constructor(
    { logger }: { logger: Logger },
    {
      concurrency = 100,
      intervalMs = 1000,
      maxRetries = 3,
      rateLimitPauseMs,
      transport = new Http2Transport(),
    }: RequestQueueOptions = {},
  ) {
    this.#logger = logger;
    this.#transport = transport;
    this.#concurrentLimiter = new ConcurrentLimiter({ logger }, concurrency);
    this.#timeRateLimiter = new TimeRateLimiter({ logger }, intervalMs);
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
    return new Promise<Response>((resolve, reject) => {
      this.#pendingRequests.push({ reject, request, resolve });
      this.#logger.trace(
        `Queued request into ${this.#pendingRequests.length} requests with ${this.#concurrentLimiter.activeRequests}/${this.#concurrentLimiter.concurrency} active requests.`,
      );
      this.#pump();
    });
  }

  async #fetch(
    request: Request | string | URL,
    retryRemains = this.#maxRetries,
  ): Promise<Response> {
    this.#logger.info(
      `Fetching request with max ${retryRemains} retries to ${request instanceof Request ? request.url : request.toString()}`,
    );

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
      this.#timeRateLimiter.postponeUntil(availableAt);
      await sleep(retryAfter);
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

  #pump() {
    if (this.#pendingRequests.length === 0) return;
    if (!this.#concurrentLimiter.canAcquire()) {
      this.#logger.trace(
        `Concurrency limit reached (${this.#concurrentLimiter.activeRequests}/${this.#concurrentLimiter.concurrency}).`,
      );
      return;
    }

    const waitMs = this.#timeRateLimiter.waitMs();
    if (waitMs > 0) {
      this.#schedulePump(waitMs);
      this.#logger.trace(
        `Waiting for request scheduler for ${waitMs}ms, until ${new Date(this.#timeRateLimiter.nextAvailableAt).toISOString()}.`,
      );
      return;
    }

    const next = this.#pendingRequests.shift();
    if (!next) {
      this.#logger.trace(`No pending requests to process.`);
      return;
    }

    this.#concurrentLimiter.acquire();
    this.#timeRateLimiter.reserveNextStart();
    this.#logger.trace(
      `Processing queued request with ${this.#concurrentLimiter.activeRequests}/${this.#concurrentLimiter.concurrency} active requests and ${this.#pendingRequests.length} pending requests.`,
    );

    void this.#fetch(next.request)
      .then(next.resolve, next.reject)
      .finally(() => {
        this.#concurrentLimiter.release();
        this.#pump();
      });
  }

  #schedulePump(waitMs: number) {
    if (this.#scheduledPump) return;

    this.#logger.trace(
      `Waiting for request scheduler for ${waitMs}ms, until ${new Date(this.#timeRateLimiter.nextAvailableAt).toISOString()}.`,
    );
    this.#scheduledPump = setTimeout(() => {
      this.#scheduledPump = undefined;
      this.#pump();
    }, waitMs);
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
