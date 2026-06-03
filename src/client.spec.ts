import { describe, expect, it } from "vitest";

import { FanboxApiError, FanboxClient } from "./index.js";

interface RecordedRequest {
  init?: RequestInit;
  input: Parameters<typeof globalThis.fetch>[0];
}

function createRecordingFetch(body: unknown) {
  const requests: RecordedRequest[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    requests.push({ init, input });

    return Promise.resolve(
      new Response(JSON.stringify({ body }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
  };

  return { fetch, requests };
}

function getRequestUrl(request?: RecordedRequest): string {
  if (typeof request?.input === "string") {
    return request.input;
  }

  if (request?.input instanceof URL) {
    return request.input.href;
  }

  return request?.input.url ?? "";
}

describe("FanboxClient collection endpoints", () => {
  it("gets a creator with FANBOX headers and unwraps its body", async () => {
    const creator = { creatorId: "alfabravo11" };
    const { fetch, requests } = createRecordingFetch(creator);
    const client = new FanboxClient({
      cookie: "FANBOXSESSID=session-id",
      fetch,
    });

    await expect(
      client.getCreator({ creatorId: "alfabravo11" }),
    ).resolves.toEqual(creator);

    expect(requests).toHaveLength(1);
    expect(getRequestUrl(requests[0])).toBe(
      "https://api.fanbox.cc/creator.get?creatorId=alfabravo11",
    );
    expect(requests[0]?.init).toMatchObject({
      headers: {
        Cookie: "FANBOXSESSID=session-id",
        Origin: "https://www.fanbox.cc",
        Referer: "https://www.fanbox.cc/",
      },
      method: "GET",
    });
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
      const { fetch, requests } = createRecordingFetch([]);
      const client = new FanboxClient({
        baseUrl: "https://example.test/api/",
        fetch,
      });

      await client[method](params);

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
    const { fetch, requests } = createRecordingFetch([]);
    const client = new FanboxClient({ fetch });

    await client[method]();

    expect(getRequestUrl(requests[0])).toBe(`https://api.fanbox.cc/${path}`);
  });

  it("lists home posts while omitting unset pagination values", async () => {
    const { fetch, requests } = createRecordingFetch([]);
    const client = new FanboxClient({ fetch });

    await client.listHomePosts({ limit: 20 });

    expect(getRequestUrl(requests[0])).toBe(
      "https://api.fanbox.cc/post.listHome?limit=20",
    );
  });

  it("lists supporting posts with cursor pagination", async () => {
    const { fetch, requests } = createRecordingFetch([]);
    const client = new FanboxClient({ fetch });

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
    const fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
          status: 401,
          statusText: "Unauthorized",
        }),
      );
    const client = new FanboxClient({ fetch });

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

  it("preserves a non-JSON error body", async () => {
    const fetch = () =>
      Promise.resolve(
        new Response("Bad Gateway", {
          status: 502,
          statusText: "Bad Gateway",
        }),
      );
    const client = new FanboxClient({ fetch });

    const error = await client
      .getCreator({ creatorId: "creator" })
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      body: "Bad Gateway",
      status: 502,
    });
  });
});
