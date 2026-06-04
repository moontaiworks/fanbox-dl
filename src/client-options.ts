import type { HttpTransport } from "./http.js";

export interface FanboxClientOptions {
  baseUrl?: string;
  cookie?: string;
  transport?: HttpTransport;
  userAgent?: string;
}
