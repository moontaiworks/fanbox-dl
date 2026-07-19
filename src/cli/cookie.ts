export function normalizeCookie(cookie?: string): string | undefined {
  const value = cookie?.trim();
  if (!value) {
    return undefined;
  }
  const cookies = parseNetscapeCookies(value);
  if (cookies.length > 0) {
    return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  }

  return value.includes("=") ? value : `FANBOXSESSID=${value}`;
}

function isFanboxCookieDomain(domain: string): boolean {
  const normalized = domain.replace(/^\./, "").toLowerCase();
  return normalized === "fanbox.cc" || normalized.endsWith(".fanbox.cc");
}

function parseNetscapeCookies(value: string): {
  name: string;
  value: string;
}[] {
  const cookies: { name: string; value: string }[] = [];
  for (const line of value.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const columns = line.split("\t");
    if (columns.length < 7) {
      continue;
    }
    const [domain, , , , , name, cookieValue] = columns;
    if (!isFanboxCookieDomain(domain)) {
      continue;
    }
    cookies.push({ name, value: cookieValue });
  }

  return cookies;
}
