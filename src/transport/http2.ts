import { Http2SessionManager } from "./http2-session.js";

const HTTP2_HEADER_STATUS = ":status";

export interface HttpTransport {
  fetch(input: Request | string | URL): Promise<Response>;
}

export class Http2Error extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "Http2Error";
  }
}

export class Http2Transport {
  readonly #pool = new Http2SessionManager();

  fetch(input: Request | string | URL) {
    const request = input instanceof Request ? input : new Request(input);
    attachHttp2Headers(request);

    const session = this.#pool.getSession(request.url);
    const stream = session.request(
      { ...Object.fromEntries(request.headers) },
      { endStream: !request.body },
    );

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      stream.once("error", reject);
      stream.once("close", () => {
        if (!settled) {
          reject(new Http2Error(`HTTP/2 stream closed before response`));
        }
      });

      stream.once("response", (responseHeaders) => {
        settled = true;
        resolve(
          new Response(stream, {
            headers: createResponseHeaders(responseHeaders),
            status: parseStatus(responseHeaders[HTTP2_HEADER_STATUS]),
          }),
        );
      });

      // If the request has a body, write it to the stream. If writing fails, destroy the stream to trigger error handling.
      if (request.body) stream.end(request.body);
    });
  }
}

function attachHttp2Headers(request: Request) {
  const url = new URL(request.url);
  const headers = request.headers;

  headers.set(":authority", url.host);
  headers.set(":method", request.method.toUpperCase());
  headers.set(":path", `${url.pathname}${url.search}`);
  headers.set(":scheme", url.protocol.slice(0, -1));
}

function createResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (
      // ignore HTTP/2 pseudo-headers in the response
      key.startsWith(":") ||
      value === undefined
    )
      continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    } else {
      result.set(key, value);
    }
  }

  return result;
}

function parseStatus(status: number | string | string[] | undefined): number {
  if (typeof status === "number") {
    return status;
  }
  if (Array.isArray(status)) {
    return Number(status[0] ?? 0);
  }

  return Number(status ?? 0);
}
