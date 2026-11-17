// URL identity for research sources (design D3): a fact's source counts as read when its
// normalized form matches a page the reader served.

/** Lowercase scheme and host, no fragment, no trailing slash, no default port. `null` if invalid. */
export function normalizeSourceUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}${path}${url.search}`;
}
