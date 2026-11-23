import type { NormalizedOfferInput } from "@job-radar/core";
import {
  createApplication,
  findOfferByExternalId,
  getOffer,
  setTriage,
  upsertSource,
} from "@job-radar/db";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestOffers } from "../src/ingest/pipeline";
import { tempProfileDir, testContext } from "./helpers";

const offer = (o: Partial<NormalizedOfferInput>): NormalizedOfferInput => ({
  sourceId: "ashby",
  externalId: "1",
  sourceUrl: "https://example.invalid/jobs/1",
  title: "Senior AI Engineer",
  companyName: "Contoso",
  remotePolicy: "hybrid",
  description: "Agentic RAG with TypeScript and Next.js.",
  ...o,
});

/** The seed profile with these hybrid regions (remote-only stays on). */
function setHybridRegions(dir: string, regions: string[]) {
  const file = join(dir, "preferences.yaml");
  const text = readFileSync(file, "utf8").replace(
    /hybrid_regions: \[[^\]]*\]/,
    `hybrid_regions: [${regions.join(", ")}]`,
  );
  writeFileSync(file, text);
}

function setup(regions: string[]) {
  const dir = tempProfileDir();
  setHybridRegions(dir, regions);
  const ctx = testContext(dir);
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby" });
  const ingest = (offers: NormalizedOfferInput[]) =>
    ingestOffers(ctx.db, "ashby", offers, ctx.profile.get()!.preferences);
  return { ...ctx, dir, ingest };
}

const byId = (s: ReturnType<typeof setup>, id: string) =>
  getOffer(s.db, findOfferByExternalId(s.db, id)!.id)!;

describe("hybrid regions in the pre-filter", () => {
  it("a hybrid role in a hybrid region is scored; elsewhere and on-site are filtered", () => {
    const s = setup(["Spain", "Madrid"]);
    const r = s.ingest([
      offer({ externalId: "madrid", location: "Madrid, Spain" }),
      offer({ externalId: "berlin", companyName: "Fabrikam", location: "Berlin, Germany" }),
      offer({
        externalId: "onsite",
        companyName: "Northwind",
        location: "Madrid",
        remotePolicy: "onsite",
      }),
    ]);
    expect(r.newOfferIds).toEqual([findOfferByExternalId(s.db, "madrid")!.id]);
    expect(byId(s, "berlin").triageReason).toBe("Not remote (hybrid)");
    expect(byId(s, "onsite").triageReason).toBe("Not remote (onsite)");
  });

  it("changing the list restores or filters open hybrid offers on reload", () => {
    const s = setup([]);
    s.ingest([
      offer({ externalId: "bcn", location: "Barcelona, Spain" }),
      offer({ externalId: "applied", companyName: "Litware", location: "Valencia, Spain" }),
      offer({
        externalId: "keyword",
        companyName: "Woodgrove",
        title: "WordPress Developer",
        description: "WordPress",
        location: "Madrid, Spain",
      }),
    ]);
    const applied = byId(s, "applied");
    createApplication(s.db, { offerId: applied.id, at: new Date() });
    // An application keeps the offer as it is, even when it was filtered.
    setTriage(s.db, applied.id, "filtered", "Not remote (hybrid)");
    expect(byId(s, "bcn").triage).toBe("filtered");

    setHybridRegions(s.dir, ["Spain"]);
    s.profile.reload();
    expect(byId(s, "bcn")).toMatchObject({ triage: "new", scoreStatus: "awaiting_score" });
    expect(byId(s, "applied").triage).toBe("filtered");
    expect(byId(s, "keyword").triageReason).toMatch(/WordPress/);

    setHybridRegions(s.dir, []);
    s.profile.reload();
    expect(byId(s, "bcn")).toMatchObject({
      triage: "filtered",
      triageReason: "Not remote (hybrid)",
    });
  });
});
