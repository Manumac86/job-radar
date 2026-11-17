// The research agent's page reader (company-research spec, "Restricted research tools";
// design D2). GET only, no cookies or credentials, public addresses only (checked again on
// every redirect and after DNS resolution), capped size and type. Never uses the browser
// profile. Every page it serves is recorded so facts can only cite pages actually read.
import { normalizeSourceUrl, wrapUntrusted } from "@job-radar/core";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { USER_AGENT } from "./http";
import { ImportError, checkImportUrl } from "./import-url";

export class ReadPageError extends Error {
  override readonly name = "ReadPageError";
}

export interface PageReaderOptions {
  fetchImpl?: typeof fetch;
  /** Resolves a host name to its IP addresses (default: DNS). */
  resolve?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxChars?: number;
  maxRedirects?: number;
  /** Most pages one research may read. */
  maxPages?: number;
  userAgent?: string;
}

export interface ReadPageResult {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

export interface PageReader {
  read(url: string): Promise<ReadPageResult>;
  /** Normalized URLs of every page served so far (requested and final after redirects). */
  readonly readUrls: ReadonlySet<string>;
}

export const READ_PAGE_LIMITS = {
  timeoutMs: 10_000,
  maxBytes: 1_500_000,
  maxChars: 20_000,
  maxRedirects: 3,
  maxPages: 25,
};

/** Loopback, private, link-local, CGNAT, unspecified, multicast and IPv4-mapped forms. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return (
      s === "::" ||
      s === "::1" ||
      /^f[cd]/.test(s) ||
      /^fe[89ab]/.test(s) ||
      /^ff/.test(s) ||
      s.startsWith("::ffff:")
    );
  }
  return true;
}

async function defaultResolve(host: string): Promise<string[]> {
  const all = await lookup(host, { all: true, verbatim: true });
  return all.map((a) => a.address);
}

const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "li",
  "ul",
  "ol",
  "tr",
  "table",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "br",
  "blockquote",
  "pre",
  "dd",
  "dt",
]);

/** Readable text with links kept as `[text](url)` (absolute http(s) links only). */
export function pageToText(html: string, base: URL): { title: string; text: string } {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, template, iframe, form, input, button, select").remove();
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const out: string[] = [];
  const walk = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        out.push(node.data.replace(/\s+/g, " "));
      } else if (node.type === "tag") {
        const name = node.name.toLowerCase();
        if (name === "a") {
          const label = $(node).text().replace(/\s+/g, " ").trim();
          const href = $(node).attr("href");
          let abs: string | null = null;
          try {
            const u = href ? new URL(href, base) : null;
            if (u && (u.protocol === "https:" || u.protocol === "http:")) abs = u.toString();
          } catch {
            abs = null;
          }
          out.push(abs && label ? ` [${label}](${abs}) ` : ` ${label} `);
          continue;
        }
        if (BLOCK.has(name)) out.push("\n");
        walk(node.children);
        if (BLOCK.has(name)) out.push("\n");
      }
    }
  };
  const body = $("body").get(0);
  walk(body ? body.children : ($.root().get(0)?.children ?? []));
  const text = out
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ReadPageError(`Page is larger than ${Math.round(maxBytes / 1000)} KB`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createPageReader(options: PageReaderOptions = {}): PageReader {
  const {
    fetchImpl = fetch,
    resolve = defaultResolve,
    timeoutMs = READ_PAGE_LIMITS.timeoutMs,
    maxBytes = READ_PAGE_LIMITS.maxBytes,
    maxChars = READ_PAGE_LIMITS.maxChars,
    maxRedirects = READ_PAGE_LIMITS.maxRedirects,
    maxPages = READ_PAGE_LIMITS.maxPages,
    userAgent = USER_AGENT,
  } = options;
  const readUrls = new Set<string>();
  let pages = 0;

  async function checkPublic(raw: string): Promise<URL> {
    let url: URL;
    try {
      url = checkImportUrl(raw);
    } catch (err) {
      throw new ReadPageError(err instanceof ImportError ? err.message : "Invalid link");
    }
    if (url.username || url.password) throw new ReadPageError("Links with credentials are refused");
    url.hash = "";
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    try {
      addresses = isIP(host) ? [host] : await resolve(host);
    } catch {
      throw new ReadPageError(`Could not resolve ${host}`);
    }
    if (!addresses.length || addresses.some(isPrivateAddress))
      throw new ReadPageError("Local and private network addresses are refused");
    return url;
  }

  async function read(raw: string): Promise<ReadPageResult> {
    if (pages >= maxPages) throw new ReadPageError(`Page limit of ${maxPages} reached`);
    pages++;
    const requested = await checkPublic(raw);
    let url = requested;
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await fetchImpl(url.toString(), {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers: {
            "user-agent": userAgent,
            accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          },
          signal,
        });
      } catch (err) {
        throw new ReadPageError(
          signal.aborted
            ? `Timed out after ${timeoutMs / 1000}s`
            : `Could not load the page: ${String(err)}`,
        );
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get("location");
        if (!location) throw new ReadPageError(`Redirect without a location (${res.status})`);
        if (hop >= maxRedirects) throw new ReadPageError(`More than ${maxRedirects} redirects`);
        url = await checkPublic(new URL(location, url).toString());
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new ReadPageError(`HTTP ${res.status}`);
      }
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      const isHtml = type.includes("text/html") || type.includes("application/xhtml");
      if (!isHtml && !type.includes("text/plain")) {
        await res.body?.cancel().catch(() => {});
        throw new ReadPageError(`Unsupported content type: ${type || "unknown"}`);
      }
      const body = await readCapped(res, maxBytes);
      const page = isHtml ? pageToText(body, url) : { title: "", text: body.trim() };
      const truncated = page.text.length > maxChars;
      for (const u of [requested.toString(), url.toString()]) {
        const n = normalizeSourceUrl(u);
        if (n) readUrls.add(n);
      }
      return {
        url: url.toString(),
        title: page.title.slice(0, 300),
        text: truncated ? page.text.slice(0, maxChars) : page.text,
        truncated,
      };
    }
  }

  return { read, readUrls };
}

/** What the model sees as the tool's result: metadata, then the page inside an untrusted block. */
export function formatReadPage(result: ReadPageResult): string {
  return [
    `URL: ${result.url}`,
    `Title: ${result.title || "(none)"}`,
    result.truncated ? "(text truncated)" : "",
    wrapUntrusted("page", result.text),
  ]
    .filter(Boolean)
    .join("\n");
}
