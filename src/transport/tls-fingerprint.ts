import {
  type ClientIdentifier,
  type CustomTlsClient,
  type HttpMethod,
  type Session,
  TLSClient,
} from "tls-client-node";

import type { HttpTransport } from "./http2.js";

export interface TlsFingerprintTransportOptions {
  /** Use an existing TLSClient instance when lifecycle is managed by the caller. */
  client?: TLSClient;
  /** A tls-client browser profile, for example `chrome_136` or `firefox_147`. */
  clientIdentifier?: ClientIdentifier;
  /** Override the profile with an explicit JA3/HTTP2 configuration. */
  customTlsClient?: CustomTlsClient;
  /** Skip certificate verification. Keep this false unless testing. */
  insecureSkipVerify?: boolean;
  /** Per-request timeout in milliseconds. */
  timeoutMilliseconds?: number;
}

/**
 * Fetch-compatible transport backed by tls-client's browser impersonation
 * profiles. Unlike node:http2, the underlying client controls ClientHello as
 * well as HTTP/2 settings and therefore can produce a browser-like transport
 * fingerprint.
 */
export class TlsFingerprintTransport implements HttpTransport {
  readonly #client: TLSClient;
  readonly #ownsClient: boolean;
  readonly #session: Session;

  public constructor(options: TlsFingerprintTransportOptions = {}) {
    this.#client = options.client ?? new TLSClient();
    this.#ownsClient = options.client === undefined;
    this.#session = this.#client.session({
      clientIdentifier: options.clientIdentifier ?? "chrome_136",
      customTlsClient: options.customTlsClient,
      disableHttp3: true,
      followRedirects: false,
      insecureSkipVerify: options.insecureSkipVerify ?? false,
      timeoutMilliseconds: options.timeoutMilliseconds,
    });
  }

  public async close(): Promise<void> {
    await this.#session.close();
    if (this.#ownsClient) await this.#client.stop();
  }

  public async fetch(input: Request | string | URL): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input);
    const response = await this.#session.request(request.url, {
      body: await readRequestBody(request),
      followRedirects: false,
      headers: Object.fromEntries(request.headers),
      method: request.method.toUpperCase() as HttpMethod,
    });

    const headers = new Headers();
    for (const [name, values] of Object.entries(response.headers)) {
      for (const value of values) headers.append(name, value);
    }

    // Fetch forbids a body for these status codes.
    const body = [204, 205, 304].includes(response.status)
      ? null
      : await response.bytes();

    return new Response(body, {
      headers,
      status: response.status,
    });
  }
}

async function readRequestBody(
  request: Request,
): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;

  return new Uint8Array(await request.arrayBuffer());
}
