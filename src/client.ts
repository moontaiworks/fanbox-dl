import type { FanboxClientOptions } from "./client-options.js";
import {
  CREATOR_GET_PATH,
  type GetCreatorParams,
  type GetCreatorResult,
} from "./endpoints/creator-get.js";
import {
  CREATOR_LIST_FOLLOWING_PATH,
  type ListFollowingCreatorsResult,
} from "./endpoints/creator-list-following.js";
import type { FanboxEnvelope } from "./endpoints/fanbox-envelope.js";
import {
  type ListCreatorPlansParams,
  type ListCreatorPlansResult,
  PLAN_LIST_CREATOR_PATH,
} from "./endpoints/plan-list-creator.js";
import {
  type ListSupportingPlansResult,
  PLAN_LIST_SUPPORTING_PATH,
} from "./endpoints/plan-list-supporting.js";
import {
  type GetPostParams,
  type GetPostResult,
  POST_INFO_PATH,
} from "./endpoints/post-info.js";
import {
  type ListCreatorPostsParams,
  type ListCreatorPostsResult,
  POST_LIST_CREATOR_PATH,
} from "./endpoints/post-list-creator.js";
import {
  type ListHomePostsParams,
  type ListHomePostsResult,
  POST_LIST_HOME_PATH,
} from "./endpoints/post-list-home.js";
import {
  type ListSupportingPostsParams,
  type ListSupportingPostsResult,
  POST_LIST_SUPPORTING_PATH,
} from "./endpoints/post-list-supporting.js";
import {
  type PaginateCreatorPostsParams,
  type PaginateCreatorPostsResult,
  POST_PAGINATE_CREATOR_PATH,
} from "./endpoints/post-paginate-creator.js";
import { createFanboxRequestHeaders } from "./fanbox-headers.js";
import {
  Http2Transport,
  type HttpResponse,
  type HttpTransport,
} from "./http.js";

const DEFAULT_BASE_URL = "https://api.fanbox.cc";

export class FanboxApiError extends Error {
  public readonly body: unknown;
  public readonly status: number;
  public readonly statusText: string;

  public constructor(response: HttpResponse, body: unknown) {
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
  readonly #baseUrl: string;
  readonly #headers: Record<string, string>;
  readonly #transport: HttpTransport;

  public constructor(options: FanboxClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#headers = createFanboxRequestHeaders({
      cookie: options.cookie,
      userAgent: options.userAgent,
    });
    this.#transport = options.transport ?? new Http2Transport();
  }

  public getCreator(params: GetCreatorParams): Promise<GetCreatorResult> {
    return this.#get(CREATOR_GET_PATH, params);
  }

  public getPost(params: GetPostParams): Promise<GetPostResult> {
    return this.#get(POST_INFO_PATH, params);
  }

  public listCreatorPlans(
    params: ListCreatorPlansParams,
  ): Promise<ListCreatorPlansResult> {
    return this.#get(PLAN_LIST_CREATOR_PATH, params);
  }

  public listCreatorPosts(
    params: ListCreatorPostsParams,
  ): Promise<ListCreatorPostsResult> {
    return this.#get(POST_LIST_CREATOR_PATH, params);
  }

  public listFollowingCreators(): Promise<ListFollowingCreatorsResult> {
    return this.#get(CREATOR_LIST_FOLLOWING_PATH);
  }

  public listHomePosts(
    params: ListHomePostsParams = {},
  ): Promise<ListHomePostsResult> {
    return this.#get(POST_LIST_HOME_PATH, params);
  }

  public listSupportingPlans(): Promise<ListSupportingPlansResult> {
    return this.#get(PLAN_LIST_SUPPORTING_PATH);
  }

  public listSupportingPosts(
    params: ListSupportingPostsParams = {},
  ): Promise<ListSupportingPostsResult> {
    return this.#get(POST_LIST_SUPPORTING_PATH, params);
  }

  public paginateCreatorPosts(
    params: PaginateCreatorPostsParams,
  ): Promise<PaginateCreatorPostsResult> {
    return this.#get(POST_PAGINATE_CREATOR_PATH, params);
  }

  async #get<T>(path: string, query: object = {}): Promise<T> {
    const url = new URL(
      path,
      this.#baseUrl.endsWith("/") ? this.#baseUrl : `${this.#baseUrl}/`,
    );
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.#transport.request({
      headers: this.#headers,
      method: "GET",
      url,
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new FanboxApiError(response, body);
    }

    return (body as FanboxEnvelope<T>).body;
  }
}

async function readResponseBody(response: HttpResponse): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
