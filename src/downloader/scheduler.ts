import { logDebugResponse } from "./errors.js";
import type { Logger } from "./logger.js";
import { silentLogger } from "./logger.js";

export interface RequestSchedulerOptions {
  concurrency: number;
  logger?: Logger;
  maxRetries?: number;
  now?: () => number;
  rateLimitPauseMs?: number;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

type Fetch = typeof globalThis.fetch;

export class RequestScheduler {
  #active = 0;
  readonly #concurrency: number;
  readonly #logger: Logger;
  readonly #maxRetries: number;
  #nextStartAt = 0;
  readonly #now: () => number;
  #pausedUntil = 0;
  readonly #rateLimitPauseMs: number;
  readonly #requestIntervalMs: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #waiting: (() => void)[] = [];

  public constructor(options: RequestSchedulerOptions) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) {
      throw new Error("concurrency must be a positive integer");
    }
    this.#concurrency = options.concurrency;
    this.#logger = options.logger ?? silentLogger;
    this.#maxRetries = options.maxRetries ?? 5;
    this.#now = options.now ?? Date.now;
    this.#rateLimitPauseMs = options.rateLimitPauseMs ?? 60_000;
    this.#requestIntervalMs = options.requestIntervalMs ?? 0;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  public async fetch(
    input: Parameters<Fetch>[0],
    fetch: Fetch = globalThis.fetch,
    init?: Parameters<Fetch>[1],
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      try {
        const response = await this.run(() => fetch(input, init));
        if (
          !isRetryableStatus(response.status) ||
          attempt >= this.#maxRetries
        ) {
          return response;
        }
        await logDebugResponse(this.#logger, response, {
          attempt: attempt + 1,
        });
        if (response.status === 429) {
          const pauseMs =
            parseRetryAfter(response, this.#now()) ?? this.#rateLimitPauseMs;
          this.pause(pauseMs);
          this.#logger.warn(
            "request.rate-limit.pause",
            "Rate limit reached; pausing requests",
            { pauseMs },
          );
        }
      } catch (error) {
        if (attempt >= this.#maxRetries) {
          throw error;
        }
      }
      this.#logger.warn("request.retry", "Retrying request", {
        attempt: attempt + 1,
      });
      attempt += 1;
    }
  }

  public pause(milliseconds: number): void {
    this.#pausedUntil = Math.max(this.#pausedUntil, this.#now() + milliseconds);
  }

  public async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.#acquire();
    try {
      await this.#waitToStart();
      return await operation();
    } finally {
      this.#release();
    }
  }

  async #acquire(): Promise<void> {
    if (this.#active >= this.#concurrency) {
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    }
    this.#active += 1;
  }

  #release(): void {
    this.#active -= 1;
    this.#waiting.shift()?.();
  }

  async #waitToStart(): Promise<void> {
    for (;;) {
      const now = this.#now();
      const delay = Math.max(this.#pausedUntil, this.#nextStartAt) - now;
      if (delay <= 0) {
        this.#nextStartAt = now + this.#requestIntervalMs;
        return;
      }
      await this.#sleep(delay);
    }
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseRetryAfter(response: Response, now: number): number | undefined {
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
