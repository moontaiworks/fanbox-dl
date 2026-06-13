import { type ClientHttp2Session, connect } from "node:http2";

export class Http2SessionManager {
  readonly #sessions = new Map<string, ClientHttp2Session>();

  async closeAll(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.all(sessions.map(closeHttp2Session));
  }

  getSession(url: string): ClientHttp2Session {
    const origin = new URL(url).origin;
    const existing = this.#sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) {
      return existing;
    }

    // Create a new HTTP/2 session for the origin
    const session = connect(origin);
    this.#sessions.set(origin, session);

    const cleanup = () => {
      if (this.#sessions.get(origin) === session) {
        this.#sessions.delete(origin);
      }
    };
    session.once("close", cleanup);
    session.once("error", cleanup);

    return session;
  }
}

function closeHttp2Session(session: ClientHttp2Session): Promise<void> {
  if (session.closed || session.destroyed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    session.close(resolve);
  });
}
