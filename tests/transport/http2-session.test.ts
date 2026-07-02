import { EventEmitter } from "node:events";
import { connect } from "node:http2";

import { Http2SessionManager } from "../../src/transport/http2-session.js";

vi.mock("node:http2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http2")>();

  return {
    ...actual,
    connect: vi.fn(() => new FakeHttp2Session()),
  };
});

describe("Http2SessionManager", () => {
  beforeEach(() => {
    vi.mocked(connect).mockClear();
  });

  it("round-robins requests across the configured sessions for the same origin", () => {
    const manager = new Http2SessionManager({ sessionsPerOrigin: 3 });

    const sessions = [
      manager.getSession("https://example.com/posts/1"),
      manager.getSession("https://example.com/posts/2"),
      manager.getSession("https://example.com/posts/3"),
      manager.getSession("https://example.com/posts/4"),
    ];

    expect(connect).toHaveBeenCalledTimes(3);
    expect(sessions[0]).not.toBe(sessions[1]);
    expect(sessions[1]).not.toBe(sessions[2]);
    expect(sessions[3]).toBe(sessions[0]);
  });

  it("keeps session pools isolated by origin", () => {
    const manager = new Http2SessionManager({ sessionsPerOrigin: 2 });

    const firstOrigin = manager.getSession("https://a.example.com/file");
    const secondOrigin = manager.getSession("https://b.example.com/file");

    expect(connect).toHaveBeenCalledTimes(2);
    expect(firstOrigin).not.toBe(secondOrigin);
  });
});

class FakeHttp2Session extends EventEmitter {
  closed = false;
  destroyed = false;

  close(callback?: () => void) {
    this.closed = true;
    callback?.();
  }
}
