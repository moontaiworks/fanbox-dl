import { type ClientHttp2Session, connect } from "node:http2";

export interface Http2SessionManagerOptions {
  sessionsPerOrigin?: number;
}

interface OriginSessionPool {
  nextIndex: number;
  sessions: ClientHttp2Session[];
}

export class Http2SessionManager {
  readonly #pools = new Map<string, OriginSessionPool>();
  readonly #sessionsPerOrigin: number;

  constructor({ sessionsPerOrigin = 5 }: Http2SessionManagerOptions = {}) {
    this.#sessionsPerOrigin = Math.max(1, Math.floor(sessionsPerOrigin));
  }

  async closeAll(): Promise<void> {
    const sessions = [...this.#pools.values()].flatMap((pool) => pool.sessions);
    this.#pools.clear();
    await Promise.all(sessions.map(closeHttp2Session));
  }

  getSession(url: string): ClientHttp2Session {
    const origin = new URL(url).origin;
    const pool = this.#pools.get(origin) ?? this.#createPool(origin);

    if (pool.sessions.length < this.#sessionsPerOrigin) {
      const session = this.#createSession(origin);
      pool.sessions.push(session);
      return session;
    }

    const session = pool.sessions[pool.nextIndex % pool.sessions.length];
    pool.nextIndex = (pool.nextIndex + 1) % pool.sessions.length;

    return session;
  }

  #createPool(origin: string): OriginSessionPool {
    const pool = { nextIndex: 0, sessions: [] };
    this.#pools.set(origin, pool);
    return pool;
  }

  #createSession(origin: string) {
    const session = connect(origin);

    const cleanup = () => {
      const pool = this.#pools.get(origin);
      if (!pool) return;

      const index = pool.sessions.indexOf(session);
      if (index >= 0) {
        pool.sessions.splice(index, 1);
        pool.nextIndex = Math.min(pool.nextIndex, pool.sessions.length);
      }

      if (pool.sessions.length === 0) {
        this.#pools.delete(origin);
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
