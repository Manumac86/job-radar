import { loadProfile, normalizedOfferSchema, type NormalizedOfferInput } from "@job-radar/core";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPoliteFetcher } from "../src/http";
import type { SourceContext } from "../src/types";

export const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
export const seedDir = join(import.meta.dirname, "..", "..", "..", "profile-seed");

export function seedPreferences() {
  const r = loadProfile(seedDir);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.profile.preferences;
}

/** A context whose fetch serves fixtures by URL substring. */
export function fixtureContext(
  routes: Record<string, string | (() => Response)>,
  overrides: Partial<SourceContext> = {},
): SourceContext & { logs: string[]; urls: string[] } {
  const logs: string[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    const route = routes[key]!;
    return typeof route === "function" ? route() : new Response(route, { status: 200 });
  }) as typeof fetch;
  const dataDir = mkdtempSync(join(tmpdir(), "job-radar-src-"));
  mkdirSync(join(dataDir, "profile"));
  writeFileSync(
    join(dataDir, "profile", "companies.yaml"),
    [
      "companies:",
      "  - { name: Tailscale, ats: greenhouse, slug: tailscale }",
      "  - { name: Pigment, ats: lever, slug: pigment }",
      "  - { name: LiveKit, ats: ashby, slug: livekit }",
    ].join("\n"),
  );
  return {
    sourceId: "test",
    settings: {},
    preferences: seedPreferences(),
    fetch: createPoliteFetcher({ fetchImpl, minIntervalMs: 0, sleep: async () => {} }),
    log: (l) => logs.push(l),
    dataDir,
    now: () => new Date("2026-11-15T12:00:00Z"),
    logs,
    urls,
    ...overrides,
  };
}

/** Every adapter output must satisfy the normalized offer schema. */
export function assertNormalized(offers: NormalizedOfferInput[]) {
  for (const o of offers) normalizedOfferSchema.parse(o);
}
