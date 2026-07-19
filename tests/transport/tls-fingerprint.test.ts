import { TLSClient } from "tls-client-node";

import {
  TlsFingerprintTransport,
  type TlsFingerprintTransportOptions,
} from "../../src/transport/tls-fingerprint.js";

const { closeSessionMock, requestMock, stopClientMock } = vi.hoisted(() => ({
  closeSessionMock: vi.fn(),
  requestMock: vi.fn(),
  stopClientMock: vi.fn(),
}));

vi.mock("tls-client-node", () => ({
  TLSClient: vi.fn(function () {
    return {
      session: vi.fn(() => ({
        close: closeSessionMock,
        request: requestMock,
      })),
      stop: stopClientMock,
    };
  }),
}));

describe("TlsFingerprintTransport", () => {
  beforeEach(() => {
    requestMock.mockReset();
    closeSessionMock.mockReset().mockResolvedValue(undefined);
    stopClientMock.mockReset().mockResolvedValue(undefined);
  });

  it("uses a browser profile and converts Fetch requests and responses", async () => {
    requestMock.mockResolvedValue({
      bytes: vi.fn().mockResolvedValue(new TextEncoder().encode("ok")),
      headers: { "content-type": ["text/plain"] },
      status: 200,
    });

    const transport = new TlsFingerprintTransport({
      clientIdentifier: "firefox_147",
    });
    const response = await transport.fetch(
      new Request("https://example.com/resource", {
        body: "payload",
        headers: { "x-test": "yes" },
        method: "POST",
      }),
    );

    expect(requestMock).toHaveBeenCalledOnce();
    const [sentUrl, sentOptions] = requestMock.mock.calls[0] as unknown as [
      string,
      {
        body: Uint8Array;
        headers: Record<string, string>;
        method: string;
      },
    ];
    expect(sentUrl).toBe("https://example.com/resource");
    expect(sentOptions.headers).toMatchObject({ "x-test": "yes" });
    expect(sentOptions.method).toBe("POST");
    const sentBody = sentOptions.body;
    expect(new TextDecoder().decode(sentBody)).toBe("payload");
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("does not stop a caller-owned client", async () => {
    const client = new TLSClient();
    const options = { client } satisfies TlsFingerprintTransportOptions;
    const transport = new TlsFingerprintTransport(options);

    await transport.close();

    expect(closeSessionMock).toHaveBeenCalledOnce();
    expect(stopClientMock).not.toHaveBeenCalled();
  });
});
