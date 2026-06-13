import type { HttpTransport } from "./transport/http2.js";

export interface FanboxClientOptions {
  baseUrl?: string;
  cookie?: string;
  transport?: HttpTransport;
  userAgent?: string;
}
