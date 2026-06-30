import { Http2Transport, type HttpTransport } from "../transport/http2.js";
import { getCreator } from "./endpoints/creator-get.js";
import { paginateCreatorPosts } from "./endpoints/creator-list-pages.js";
import { listCreatorPlans } from "./endpoints/creator-list-plans.js";
import { listCreatorPosts } from "./endpoints/creator-list-posts.js";
import { getPost } from "./endpoints/post-info.js";
import { listHomePosts } from "./endpoints/post-list-home.js";
import { listSupportingPosts } from "./endpoints/post-list-supporting.js";
import { listFollowingCreators } from "./endpoints/user-list-following.js";
import { listSupportingPlans } from "./endpoints/user-list-supporting.js";
import type { FanboxEnvelope } from "./fanbox-envelope.js";

const DEFAULT_BASE_URL = "https://api.fanbox.cc";

export interface FanboxClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  transport?: HttpTransport;
}

export class FanboxApiError extends Error {
  public readonly body: unknown;
  public readonly status: number;
  public readonly statusText: string;

  public constructor(response: Response, body: unknown) {
    super(
      `FANBOX API request failed: ${response.status} ${response.statusText}`,
    );
    this.name = "FanboxApiError";
    this.body = body;
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export class FanboxClient {
  getCreator = getCreator;
  getPost = getPost;
  listCreatorPlans = listCreatorPlans;
  listCreatorPosts = listCreatorPosts;
  listFollowingCreators = listFollowingCreators;
  listHomePosts = listHomePosts;
  listSupportingPlans = listSupportingPlans;
  listSupportingPosts = listSupportingPosts;
  paginateCreatorPosts = paginateCreatorPosts;

  readonly #baseUrl: string;
  readonly #headers: Record<string, string>;
  readonly #transport: HttpTransport;

  public constructor(options: FanboxClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#headers = options.headers ?? {};
    this.#transport = options.transport ?? new Http2Transport();
  }

  protected async get<T>(path: string, query: object = {}): Promise<T> {
    const url = new URL(
      path,
      this.#baseUrl.endsWith("/") ? this.#baseUrl : `${this.#baseUrl}/`,
    );
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const request = new Request(url, { headers: this.#headers });
    const response = await this.#transport.fetch(request);
    const body = await parseJSONBody<FanboxEnvelope<T>>(response);
    if (!response.ok) {
      throw new FanboxApiError(response, body);
    }

    return body.body;
  }
}

async function parseJSONBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
