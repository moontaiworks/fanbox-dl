import { type ClientHttp2Session, connect } from "node:http2";
import type { Readable } from "node:stream";

const HTTP2_HEADER_AUTHORITY = ":authority";
const HTTP2_HEADER_METHOD = ":method";
const HTTP2_HEADER_PATH = ":path";
const HTTP2_HEADER_SCHEME = ":scheme";
const HTTP2_HEADER_STATUS = ":status";

export interface HttpRequest {
  body?: BodyInit | undefined;
  headers?: Headers | Record<string, string>;
  method?: string;
  url: string | URL;
}

export interface HttpResponse {
  body: Readable;
  headers: Headers;
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

export interface HttpTransport {
  close(): Promise<void>;
  request(request: HttpRequest | string | URL): Promise<HttpResponse>;
}

type BodyInit = Blob | string | Uint8Array;

interface NormalizedHttpRequest {
  body: BodyInit | undefined;
  headers: Headers | Record<string, string> | undefined;
  method: string;
  url: URL;
}

export class Http2Transport implements HttpTransport {
  readonly #sessions = new Map<string, ClientHttp2Session>();

  public async close(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.all(sessions.map(closeSession));
  }

  public request(request: HttpRequest | string | URL): Promise<HttpResponse> {
    const normalized = normalizeRequest(request);
    const session = this.#getSession(normalized.url);
    const headers = createHttp2Headers(normalized);
    const stream = session.request(headers, { endStream: !normalized.body });

    return new Promise((resolve, reject) => {
      let settled = false;
      stream.once("error", reject);
      stream.once("response", (responseHeaders) => {
        settled = true;
        const status = parseStatus(responseHeaders[HTTP2_HEADER_STATUS]);
        resolve(
          createResponse({
            body: stream,
            headers: createResponseHeaders(responseHeaders),
            status,
          }),
        );
      });
      stream.once("close", () => {
        if (!settled) {
          reject(new HttpError(`HTTP/2 stream closed before response`));
        }
      });
      if (normalized.body !== undefined) {
        writeRequestBody(stream, normalized.body).catch((error: unknown) => {
          stream.destroy(
            error instanceof Error ? error : new Error(String(error)),
          );
        });
      }
    });
  }

  #getSession(url: URL): ClientHttp2Session {
    const origin = url.origin;
    const existing = this.#sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) {
      return existing;
    }

    const session = connect(origin);
    session.once("close", () => {
      if (this.#sessions.get(origin) === session) {
        this.#sessions.delete(origin);
      }
    });
    session.once("error", () => {
      if (this.#sessions.get(origin) === session) {
        this.#sessions.delete(origin);
      }
    });
    this.#sessions.set(origin, session);

    return session;
  }
}

export class HttpError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function closeSession(session: ClientHttp2Session): Promise<void> {
  if (session.closed || session.destroyed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    session.close(resolve);
  });
}

function createHttp2Headers(
  request: NormalizedHttpRequest,
): Record<string, string> {
  const headers: Record<string, string> = {
    [HTTP2_HEADER_AUTHORITY]: request.url.host,
    [HTTP2_HEADER_METHOD]: request.method.toUpperCase(),
    [HTTP2_HEADER_PATH]: `${request.url.pathname}${request.url.search}`,
    [HTTP2_HEADER_SCHEME]: request.url.protocol.slice(0, -1),
  };
  new Headers(request.headers).forEach((value, key) => {
    if (!isForbiddenHttp2Header(key)) {
      headers[key] = value;
    }
  });

  return headers;
}

function createResponse(options: {
  body: Readable;
  headers: Headers;
  status: number;
}): HttpResponse {
  return {
    body: options.body,
    headers: options.headers,
    json: async <T>(): Promise<T> =>
      JSON.parse(await readText(options.body)) as T,
    ok: options.status >= 200 && options.status < 300,
    status: options.status,
    statusText: "",
    text: async () => readText(options.body),
  };
}

function createResponseHeaders(
  headers: NodeJS.Dict<string | string[]>,
): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith(":") || value === undefined) {
      continue;
    }
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

function isForbiddenHttp2Header(header: string): boolean {
  return (
    header.startsWith(":") ||
    header === "connection" ||
    header === "keep-alive" ||
    header === "proxy-connection" ||
    header === "transfer-encoding" ||
    header === "upgrade"
  );
}

function normalizeRequest(
  request: HttpRequest | string | URL,
): NormalizedHttpRequest {
  if (typeof request === "string" || request instanceof URL) {
    return {
      body: undefined,
      headers: undefined,
      method: "GET",
      url: new URL(request),
    };
  }

  return {
    body: request.body,
    headers: request.headers,
    method: request.method ?? "GET",
    url: new URL(request.url),
  };
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

async function readText(body: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(toBuffer(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }

  return Buffer.from(String(chunk));
}

async function writeRequestBody(
  stream: NodeJS.WritableStream,
  body: BodyInit | undefined,
): Promise<void> {
  if (typeof body === "string" || body instanceof Uint8Array) {
    stream.end(body);
    return;
  }
  if (body instanceof Blob) {
    stream.end(Buffer.from(new Uint8Array(await body.arrayBuffer())));
    return;
  }

  throw new HttpError("Unsupported HTTP request body");
}
