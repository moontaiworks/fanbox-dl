import { describe, expect, it } from "vitest";

import { CREATOR_GET_PATH } from "./endpoints/creator-get.js";
import { CREATOR_LIST_FOLLOWING_PATH } from "./endpoints/creator-list-following.js";
import type { PostSummary as EndpointPostSummary } from "./endpoints/models/post.js";
import { PLAN_LIST_CREATOR_PATH } from "./endpoints/plan-list-creator.js";
import { PLAN_LIST_SUPPORTING_PATH } from "./endpoints/plan-list-supporting.js";
import { POST_INFO_PATH } from "./endpoints/post-info.js";
import { POST_LIST_CREATOR_PATH } from "./endpoints/post-list-creator.js";
import { POST_LIST_HOME_PATH } from "./endpoints/post-list-home.js";
import { POST_LIST_SUPPORTING_PATH } from "./endpoints/post-list-supporting.js";
import { POST_PAGINATE_CREATOR_PATH } from "./endpoints/post-paginate-creator.js";
import type { HttpRequest, HttpTransport } from "./http.js";
import { FanboxApiError, FanboxClient } from "./index.js";
import type { PostSummary as PublicPostSummary } from "./index.js";

interface RecordedRequest {
  request: HttpRequest | string | URL;
}

function createRecordingTransport(body: unknown) {
  const requests: RecordedRequest[] = [];
  const transport: HttpTransport = {
    close: () => Promise.resolve(),
    request: async (request) => {
      requests.push({ request });

      return Promise.resolve(
        new Response(JSON.stringify({ body }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    },
  };

  return { requests, transport };
}

function getRequestHeaders(request?: RecordedRequest): Headers {
  if (
    request === undefined ||
    typeof request.request === "string" ||
    request.request instanceof URL
  ) {
    return new Headers();
  }

  return new Headers(request.request.headers);
}

function getRequestUrl(request?: RecordedRequest): string {
  if (typeof request?.request === "string") {
    return request.request;
  }

  if (request?.request instanceof URL) {
    return request.request.href;
  }

  return request?.request.url.toString() ?? "";
}

describe("FanboxClient collection endpoints", () => {
  it("exposes each endpoint path from its own module", () => {
    expect(CREATOR_GET_PATH).toBe("creator.get");
    expect(CREATOR_LIST_FOLLOWING_PATH).toBe("creator.listFollowing");
    expect(PLAN_LIST_CREATOR_PATH).toBe("plan.listCreator");
    expect(PLAN_LIST_SUPPORTING_PATH).toBe("plan.listSupporting");
    expect(POST_INFO_PATH).toBe("post.info");
    expect(POST_LIST_CREATOR_PATH).toBe("post.listCreator");
    expect(POST_LIST_HOME_PATH).toBe("post.listHome");
    expect(POST_LIST_SUPPORTING_PATH).toBe("post.listSupporting");
    expect(POST_PAGINATE_CREATOR_PATH).toBe("post.paginateCreator");
  });

  it("keeps public model exports compatible with endpoint model exports", () => {
    const publicSummary = null as unknown as PublicPostSummary;
    const endpointSummary = publicSummary satisfies EndpointPostSummary;

    expect(endpointSummary).toBeNull();
  });

  it("gets a creator with FANBOX headers and unwraps its body", async () => {
    const creator = { creatorId: "alfabravo11" };
    const { requests, transport } = createRecordingTransport(creator);
    const client = new FanboxClient({
      cookie: "FANBOXSESSID=session-id",
      transport,
    });

    await expect(
      client.getCreator({ creatorId: "alfabravo11" }),
    ).resolves.toEqual(creator);

    expect(requests).toHaveLength(1);
    expect(getRequestUrl(requests[0])).toBe(
      "https://api.fanbox.cc/creator.get?creatorId=alfabravo11",
    );
    expect(requests[0]?.request).toMatchObject({ method: "GET" });
    const headers = getRequestHeaders(requests[0]);
    expect(headers.get("Accept")).toBe("application/json, text/plain, */*");
    expect(headers.get("Cookie")).toBe("FANBOXSESSID=session-id");
    expect(headers.get("Origin")).toBe("https://www.fanbox.cc");
    expect(headers.get("Referer")).toBe("https://www.fanbox.cc/");
    expect(headers.get("Sec-Fetch-Dest")).toBe("empty");
    expect(headers.get("Sec-Fetch-Mode")).toBe("cors");
    expect(headers.get("Sec-Fetch-Site")).toBe("same-site");
  });

  it("sends a caller-provided user agent", async () => {
    const { requests, transport } = createRecordingTransport([]);
    const client = new FanboxClient({
      transport,
      userAgent: "Mozilla/5.0 test",
    });

    await client.getPost({ postId: "11975272" });

    expect(getRequestHeaders(requests[0]).get("User-Agent")).toBe(
      "Mozilla/5.0 test",
    );
  });

  it.each([
    [
      "listCreatorPlans",
      "plan.listCreator?creatorId=creator",
      { creatorId: "creator" },
    ],
    [
      "paginateCreatorPosts",
      "post.paginateCreator?creatorId=creator&sort=oldest",
      { creatorId: "creator", sort: "oldest" },
    ],
    [
      "listCreatorPosts",
      "post.listCreator?creatorId=creator&firstId=123&firstPublishedDatetime=2026-05-27+21%3A17%3A41&limit=30&sort=newest",
      {
        creatorId: "creator",
        firstId: "123",
        firstPublishedDatetime: "2026-05-27 21:17:41",
        limit: 30,
        sort: "newest",
      },
    ],
    ["getPost", "post.info?postId=11975272", { postId: "11975272" }],
  ] as const)(
    "calls %s with serialized parameters",
    async (method, path, params) => {
      const { requests, transport } = createRecordingTransport([]);
      const client = new FanboxClient({
        baseUrl: "https://example.test/api/",
        transport,
      });

      await client[method](params as never);

      expect(getRequestUrl(requests[0])).toBe(
        `https://example.test/api/${path}`,
      );
    },
  );
});

describe("FanboxClient authenticated discovery endpoints", () => {
  it.each([
    ["listFollowingCreators", "creator.listFollowing"],
    ["listSupportingPlans", "plan.listSupporting"],
  ] as const)("calls %s without query parameters", async (method, path) => {
    const { requests, transport } = createRecordingTransport([]);
    const client = new FanboxClient({ transport });

    await client[method]();

    expect(getRequestUrl(requests[0])).toBe(`https://api.fanbox.cc/${path}`);
  });

  it("lists home posts while omitting unset pagination values", async () => {
    const { requests, transport } = createRecordingTransport([]);
    const client = new FanboxClient({ transport });

    await client.listHomePosts({ limit: 20 });

    expect(getRequestUrl(requests[0])).toBe(
      "https://api.fanbox.cc/post.listHome?limit=20",
    );
  });

  it("lists supporting posts with cursor pagination", async () => {
    const { requests, transport } = createRecordingTransport([]);
    const client = new FanboxClient({ transport });

    await client.listSupportingPosts({
      limit: 10,
      maxId: "11975272",
      maxPublishedDatetime: "2026-05-27 21:17:41",
    });

    expect(getRequestUrl(requests[0])).toBe(
      "https://api.fanbox.cc/post.listSupporting?limit=10&maxId=11975272&maxPublishedDatetime=2026-05-27+21%3A17%3A41",
    );
  });
});

describe("FanboxClient errors", () => {
  it("throws a structured error for an unsuccessful response", async () => {
    const body = { error: "Unauthorized" };
    const client = new FanboxClient({
      transport: {
        close: () => Promise.resolve(),
        request: () =>
          Promise.resolve(
            new Response(JSON.stringify(body), {
              headers: { "Content-Type": "application/json" },
              status: 401,
              statusText: "Unauthorized",
            }),
          ),
      },
    });

    const error = await client
      .getCreator({ creatorId: "creator" })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(FanboxApiError);
    expect(error).toMatchObject({
      body,
      status: 401,
      statusText: "Unauthorized",
    });
  });
});
