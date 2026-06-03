import {
  createServer,
  type IncomingHttpHeaders,
  type ServerHttp2Stream,
} from "node:http2";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { Http2Transport } from "./http.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

function listen(
  handler: (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => void,
): Promise<URL> {
  const server = createServer();
  server.on("stream", handler);
  servers.push(server);

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(new URL(`http://127.0.0.1:${address.port}/`));
    });
  });
}

describe("Http2Transport", () => {
  it("sends requests over HTTP/2 and parses JSON responses", async () => {
    let receivedPath = "";
    let receivedMethod = "";
    let receivedHeader = "";
    const baseUrl = await listen((stream, headers) => {
      receivedPath = String(headers[":path"]);
      receivedMethod = String(headers[":method"]);
      receivedHeader = String(headers["x-test"]);
      stream.respond({
        ":status": 200,
        "content-type": "application/json",
        "x-reply": "ok",
      });
      stream.end(JSON.stringify({ hello: "h2" }));
    });
    const transport = new Http2Transport();

    const response = await transport.request({
      headers: { "x-test": "yes" },
      method: "GET",
      url: new URL("/resource?limit=1", baseUrl),
    });

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-reply")).toBe("ok");
    await expect(response.json()).resolves.toEqual({ hello: "h2" });
    expect(receivedMethod).toBe("GET");
    expect(receivedPath).toBe("/resource?limit=1");
    expect(receivedHeader).toBe("yes");

    await transport.close();
  });

  it("exposes the response body as a Node stream", async () => {
    const baseUrl = await listen((stream) => {
      stream.respond({
        ":status": 206,
        "last-modified": "Wed, 27 May 2026 12:17:41 GMT",
      });
      stream.end("asset");
    });
    const transport = new Http2Transport();

    const response = await transport.request(new URL("/asset.png", baseUrl));
    const chunks: Buffer[] = [];
    for await (const chunk of response.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }

    expect(response.status).toBe(206);
    expect(response.headers.get("last-modified")).toBe(
      "Wed, 27 May 2026 12:17:41 GMT",
    );
    expect(Buffer.concat(chunks).toString("utf8")).toBe("asset");

    await transport.close();
  });
});
