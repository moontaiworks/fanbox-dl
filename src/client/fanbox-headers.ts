export interface FanboxRequestHeadersOptions {
  cookie?: string;
  userAgent?: string;
}

export function createFanboxRequestHeaders(
  options: FanboxRequestHeadersOptions = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Origin: "https://www.fanbox.cc",
    Referer: "https://www.fanbox.cc/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": options.userAgent ?? createRandomUserAgent(),
  };
  if (options.cookie !== undefined) {
    headers.Cookie = options.cookie;
  }

  return headers;
}

export function createRandomUserAgent(): string {
  return `${Math.random().toString(36).substring(2, 15)}/${Math.random().toFixed(5)}`;
}
