import type { NormalizedOfferInput } from "@job-radar/core";
import {
  findOfferByExternalId,
  getOffer,
  getSetting,
  listOffers,
  upsertSource,
  type Db,
} from "@job-radar/db";
import { createPoliteFetcher, type SourceAdapter } from "@job-radar/sources";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Notifier } from "../src/notifier";
import { ingestOffers, renormalizeTitles } from "../src/ingest/pipeline";
import { executeRun } from "../src/ingest/runner";
import { testContext } from "./helpers";

const JOB = "11111111-2222-4333-8444-555555555555";
const ID_NAME = "7c1f9a20 4b3e 4d8a 9F61 2e0b5c7d3a19";
const doverJson = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "packages",
    "sources",
    "test",
    "fixtures",
    "dover-job.json",
  ),
  "utf8",
);

const offer = (o: Partial<NormalizedOfferInput>): NormalizedOfferInput => ({
  sourceId: "simpleapply",
  externalId: `simpleapply:jobs.dover.com/company/${JOB}`,
  sourceUrl: `https://jobs.dover.com/company/${JOB}`,
  title: "Sr. Full-Stack Software Engineer, Remote",
  companyName: "Unknown company",
  remotePolicy: "remote",
  description: "SimpleApply match (the full description is on the company site).",
  ...o,
});

function setup() {
  const ctx = testContext();
  upsertSource(ctx.db, {
    id: "simpleapply",
    type: "simpleapply",
    name: "SimpleApply",
    enabled: true,
  });
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby" });
  const prefs = ctx.profile.get()!.preferences;
  const ingest = (source: string, offers: NormalizedOfferInput[]) =>
    ingestOffers(ctx.db, source, offers, prefs, new Date(), () => {}, { prefilter: false });
  return { ...ctx, ingest };
}

const stored = (db: Db, externalId: string) =>
  getOffer(db, findOfferByExternalId(db, externalId)!.id)!;

describe("simpleapply-dover-fixes in the pipeline", () => {
  it("corrects a stored id or unknown company from a later real name (D3)", () => {
    const s = setup();
    s.ingest("simpleapply", [offer({ companyName: ID_NAME })]);
    s.ingest("simpleapply", [
      offer({
        companyName: "Contoso Staffing",
        companyWebsite: "https://contoso.example",
        description: "Global, fully remote. Contract.",
      }),
    ]);
    const o = stored(s.db, offer({}).externalId);
    expect(o).toMatchObject({
      companyName: "Contoso Staffing",
      companyWebsite: "https://contoso.example",
      description: "Global, fully remote. Contract.",
    });
    // A real name is never replaced by a later unknown one.
    s.ingest("simpleapply", [offer({})]);
    expect(stored(s.db, offer({}).externalId).companyName).toBe("Contoso Staffing");
  });

  it("never merges offers of unknown companies by title", () => {
    const s = setup();
    const r = s.ingest("simpleapply", [
      offer({}),
      offer({ externalId: "simpleapply:other", sourceUrl: "https://jobs.dover.com/company/other" }),
    ]);
    expect(r.newOfferIds).toHaveLength(2);
  });

  it("recomputes stored titles once, so a qualifier repost becomes a duplicate (D5)", () => {
    const s = setup();
    s.ingest("ashby", [
      offer({
        sourceId: "ashby",
        externalId: "a1",
        companyName: "Fabrikam",
        sourceUrl: "https://x.invalid/1",
      }),
    ]);
    // As stored by the previous normalizer.
    s.db.$client.prepare("update offers set normalized_title = 'stale title'").run();
    expect(renormalizeTitles(s.db)).toBe(1);
    expect(getSetting(s.db, "title_normalizer_version")).toBe(2);
    expect(renormalizeTitles(s.db)).toBeNull();
    const r = s.ingest("simpleapply", [
      offer({
        externalId: "simpleapply:repost",
        sourceUrl: "https://x.invalid/2",
        companyName: "Fabrikam",
        title: "🌍 Sr. Full-Stack Software Engineer, Remote- Contract",
      }),
    ]);
    expect(r.duplicates).toBe(1);
    expect(listOffers(s.db, {}).total).toBe(1);
  });
});

describe("Dover lookup in a SimpleApply run (D1)", () => {
  it("resolves the company of new Dover offers and of stored ones with an id", async () => {
    const s = setup();
    s.ingest("simpleapply", [
      offer({
        externalId: "simpleapply:stored",
        sourceUrl: `https://jobs.dover.com/company/${JOB}`,
        companyName: ID_NAME,
      }),
    ]);
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(doverJson, { status: 200 });
    }) as typeof fetch;
    const adapter: SourceAdapter = {
      type: "simpleapply",
      label: "SimpleApply",
      defaultIntervalMinutes: 720,
      fetchOffers: async () => [
        offer({ externalId: "simpleapply:stored" }),
        offer({
          externalId: "simpleapply:new",
          sourceUrl: "https://jobs.dover.com/company/22222222-2222-4333-8444-555555555555",
        }),
        offer({
          externalId: "simpleapply:real",
          sourceUrl: "https://jobs.dover.com/company/x",
          companyName: "Northwind",
        }),
      ],
    };
    const outcome = await executeRun(
      {
        db: s.db,
        profile: s.profile,
        notifier: new Notifier(s.db),
        dataDir: "/nonexistent",
        adapters: { simpleapply: adapter },
        fetcherFactory: () =>
          createPoliteFetcher({ fetchImpl, minIntervalMs: 0, sleep: async () => {} }),
      },
      "simpleapply",
      "manual",
    );
    expect(outcome.status).toBe("finished");
    expect(urls).toHaveLength(2);
    expect(stored(s.db, "simpleapply:stored").companyName).toBe("Contoso Staffing");
    expect(stored(s.db, "simpleapply:new").companyName).toBe("Contoso Staffing");
    expect(stored(s.db, "simpleapply:real").companyName).toBe("Northwind");
  });
});
