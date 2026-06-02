import type {
  Creator,
  CreatorSummary,
  FanboxClientOptions,
  FanboxEnvelope,
  GetCreatorParams,
  GetPostParams,
  ListCreatorPlansParams,
  ListCreatorPostsParams,
  PaginateCreatorPostsParams,
  Plan,
  Post,
  PostListParams,
  PostSummary,
  SupportingPlan,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.fanbox.cc";

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
  readonly #baseUrl: string;
  readonly #cookie?: string;
  readonly #fetch: typeof globalThis.fetch;

  public constructor(options: FanboxClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#cookie = options.cookie;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  public getCreator(params: GetCreatorParams): Promise<Creator> {
    return this.#get("creator.get", params);
  }

  public getPost(params: GetPostParams): Promise<Post> {
    return this.#get("post.info", params);
  }

  public listCreatorPlans(params: ListCreatorPlansParams): Promise<Plan[]> {
    return this.#get("plan.listCreator", params);
  }

  public listCreatorPosts(
    params: ListCreatorPostsParams,
  ): Promise<PostSummary[]> {
    return this.#get("post.listCreator", params);
  }

  public listFollowingCreators(): Promise<CreatorSummary[]> {
    return this.#get("creator.listFollowing");
  }

  public listHomePosts(params: PostListParams = {}): Promise<PostSummary[]> {
    return this.#get("post.listHome", params);
  }

  public listSupportingPlans(): Promise<SupportingPlan[]> {
    return this.#get("plan.listSupporting");
  }

  public listSupportingPosts(
    params: PostListParams = {},
  ): Promise<PostSummary[]> {
    return this.#get("post.listSupporting", params);
  }

  public paginateCreatorPosts(
    params: PaginateCreatorPostsParams,
  ): Promise<string[]> {
    return this.#get("post.paginateCreator", params);
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

    const headers: Record<string, string> = {
      Origin: "https://www.fanbox.cc",
      Referer: "https://www.fanbox.cc/",
    };
    if (this.#cookie !== undefined) {
      headers.Cookie = this.#cookie;
    }

    const response = await this.#fetch(url, { headers, method: "GET" });
    const body: unknown = await response
      .clone()
      .json()
      .catch(async () => response.text());
    if (!response.ok) {
      throw new FanboxApiError(response, body);
    }

    return (body as FanboxEnvelope<T>).body;
  }
}
