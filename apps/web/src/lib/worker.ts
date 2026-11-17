import "server-only";

/** The worker API listens on localhost only (design D1). */
export const WORKER_URL = process.env["WORKER_URL"] ?? "http://127.0.0.1:4000";

export type WorkerResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

export async function workerFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<WorkerResult<T>> {
  try {
    const res = await fetch(`${WORKER_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(240_000),
    });
    const body = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
      code?: string;
    };
    if (!res.ok)
      return {
        ok: false,
        status: res.status,
        error: body.error ?? body.message ?? `Worker returned ${res.status}`,
        ...(typeof body.code === "string" ? { code: body.code } : {}),
      };
    return { ok: true, status: res.status, data: body };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "The worker is not running. Start it with `pnpm dev` or `docker compose up`.",
    };
  }
}
