import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { HttpRequest, HttpResponse, HttpTransport } from "./http.js";
import { FanboxApiError, FanboxClient } from "./index.js";

interface RecordedRequest {
  request: HttpRequest | string | URL;
}

interface TestHttpResponseInit {
  headers?: Headers | Record<string, string>;
  status?: number;
  statusText?: string;
}

function createHttpResponse(
  body: unknown,
  init: TestHttpResponseInit = {},
): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const status = init.status ?? 200;

  return {
    body: Readable.from([text]),
    headers: new Headers(init.headers),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    text: () => Promise.resolve(text),
  };
}

function createRecordingTransport(body: unknown) {
  const requests: RecordedRequest[] = [];
  const transport: HttpTransport = {
    close: () => Promise.resolve(),
    request: (request) => {
      requests.push({ request });

      return Promise.resolve(
        createHttpResponse(
          { body },
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
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
            createHttpResponse(body, {
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

  it("preserves a non-JSON error body", async () => {
    const client = new FanboxClient({
      transport: {
        close: () => Promise.resolve(),
        request: () =>
          Promise.resolve(
            createHttpResponse("Bad Gateway", {
              status: 502,
              statusText: "Bad Gateway",
            }),
          ),
      },
    });

    const error = await client
      .getCreator({ creatorId: "creator" })
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      body: "Bad Gateway",
      status: 502,
    });
  });
});
