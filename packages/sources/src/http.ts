// Polite fetching (job-ingestion spec): descriptive user agent, minimum interval between
// requests, exponential backoff on 429/5xx honoring Retry-After.

export const USER_AGENT =
  "JobRadar/0.1 (personal job-search tool; single user; low request volume)";

export class HttpError extends Error {
  override readonly name = "HttpError";
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
  get rateLimited(): boolean {
    return this.status === 429;
  }
}

export interface PoliteFetchOptions {
  userAgent?: string;
  /** Minimum time between two requests from this fetcher. */
  minIntervalMs?: number;
  /** Retries after the first attempt for 429 / 5xx / network errors. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onLog?: (line: string) => void;
}

export interface PoliteFetcher {
  (url: string, init?: RequestInit): Promise<Response>;
  json<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  text(url: string, init?: RequestInit): Promise<string>;
  readonly requests: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function createPoliteFetcher(opts: PoliteFetchOptions = {}): PoliteFetcher {
  const {
    userAgent = USER_AGENT,
    minIntervalMs = 1000,
    maxRetries = 4,
    baseDelayMs = 2000,
    maxDelayMs = 120_000,
    timeoutMs = 30_000,
    fetchImpl = fetch,
    sleep = defaultSleep,
    onLog = () => {},
  } = opts;
  let last = 0;
  let count = 0;

  async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      count++;
      let res: Response | null = null;
      let networkError: unknown = null;
      try {
        res = await fetchImpl(url, {
          ...init,
          headers: { "user-agent": userAgent, accept: "*/*", ...(init.headers ?? {}) },
          signal: init.signal ?? AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        networkError = err;
      }
      const retryable = networkError !== null || (res && (res.status === 429 || res.status >= 500));
      if (!retryable && res) {
        if (!res.ok) throw new HttpError(res.status, url);
        return res;
      }
      const what = res
        ? `HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}`
        : `network error: ${String(networkError)}`;
      if (attempt >= maxRetries) {
        onLog(`${what} for ${url}; giving up after ${attempt + 1} attempts`);
        if (res)
          throw new HttpError(res.status, url, `${what} for ${url} after ${attempt + 1} attempts`);
        throw networkError instanceof Error ? networkError : new Error(String(networkError));
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = Math.min(maxDelayMs, Math.max(backoff, res ? (retryAfterMs(res) ?? 0) : 0));
      onLog(`${what} for ${url}; retrying in ${Math.round(delay / 1000)}s`);
      await res?.body?.cancel().catch(() => {});
      await sleep(delay);
    }
  }

  const fetcher = politeFetch as PoliteFetcher;
  fetcher.json = async <T>(url: string, init?: RequestInit) =>
    (await (
      await politeFetch(url, {
        ...init,
        headers: { accept: "application/json", ...(init?.headers ?? {}) },
      })
    ).json()) as T;
  fetcher.text = async (url: string, init?: RequestInit) => (await politeFetch(url, init)).text();
  Object.defineProperty(fetcher, "requests", { get: () => count });
  return fetcher;
}
