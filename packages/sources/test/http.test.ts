import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { HttpError, USER_AGENT, createPoliteFetcher } from "../src/http";

let server: Server | null = null;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler);
  return new Promise((resolve) =>
    server!.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`),
    ),
  );
}

describe("polite fetching", () => {
  it("backs off on 429 honoring Retry-After, then succeeds, and logs the rate limit", async () => {
    let hits = 0;
    const agents: string[] = [];
    const base = await listen((req, res) => {
      hits++;
      agents.push(String(req.headers["user-agent"]));
      if (hits <= 2) {
        res.writeHead(429, { "retry-after": "3" }).end("slow down");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    });
    const sleeps: number[] = [];
    const log: string[] = [];
    const fetcher = createPoliteFetcher({
      minIntervalMs: 0,
      baseDelayMs: 1000,
      sleep: async (ms) => void sleeps.push(ms),
      onLog: (l) => log.push(l),
    });
    expect(await fetcher.json(`${base}/jobs`)).toEqual({ ok: true });
    expect(hits).toBe(3);
    expect(sleeps).toEqual([3000, 3000]); // max(backoff 1s/2s, Retry-After 3s)
    expect(log[0]).toMatch(/HTTP 429 \(rate limited\).*retrying in 3s/);
    expect(agents.every((a) => a === USER_AGENT)).toBe(true);
  });

  it("uses exponential backoff on 5xx and gives up after the retries", async () => {
    const base = await listen((_req, res) => res.writeHead(503).end());
    const sleeps: number[] = [];
    const fetcher = createPoliteFetcher({
      minIntervalMs: 0,
      baseDelayMs: 100,
      maxRetries: 3,
      sleep: async (ms) => void sleeps.push(ms),
    });
    const err = await fetcher(`${base}/x`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("does not retry client errors and spaces requests by the minimum interval", async () => {
    let hits = 0;
    const base = await listen((_req, res) => {
      hits++;
      res.writeHead(404).end();
    });
    const sleeps: number[] = [];
    const fetcher = createPoliteFetcher({
      minIntervalMs: 60_000,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await expect(fetcher(`${base}/a`)).rejects.toMatchObject({ status: 404 });
    await expect(fetcher(`${base}/b`)).rejects.toMatchObject({ status: 404 });
    expect(hits).toBe(2);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(59_000);
  });
});
