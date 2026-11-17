import { getOffer, openDatabase, recordScore, upsertSource, type Db } from "@job-radar/db";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import type { WorkerContext } from "../src/context";
import { ProfileService } from "../src/profile-service";
import { ingestOffers } from "../src/ingest/pipeline";

export const seedDir = join(import.meta.dirname, "..", "..", "..", "profile-seed");

export function tempProfileDir(withSeed = true): string {
  const dir = mkdtempSync(join(tmpdir(), "job-radar-worker-"));
  if (withSeed) {
    cpSync(join(seedDir, "cv.md"), join(dir, "cv.md"));
    cpSync(join(seedDir, "preferences.yaml"), join(dir, "preferences.yaml"));
  }
  return dir;
}

export function testContext(profileDir = tempProfileDir()): WorkerContext & { db: Db } {
  const db = openDatabase({ path: ":memory:" });
  const profile = new ProfileService(db, profileDir);
  profile.reload();
  return { db, profile };
}

export function testApp(ctx = testContext()) {
  return { ctx, app: createApp(ctx) };
}

export function seedScoredOffer(ctx = testContext(), overall = 88) {
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby" });
  const [id] = ingestOffers(
    ctx.db,
    "ashby",
    [
      {
        sourceId: "ashby",
        externalId: `x-${Math.random()}`,
        sourceUrl: "https://jobs.example.invalid/1",
        title: "Senior AI Engineer",
        companyName: `Northwind ${Math.random()}`,
        remotePolicy: "remote",
        description: "Agentic RAG",
        compensation: { min: 9000, max: 9000, currency: "EUR", period: "hour" },
      },
    ],
    ctx.profile.get()!.preferences,
  ).newOfferIds;
  const score = recordScore(ctx.db, {
    offerId: id!,
    overall,
    modelOverall: overall,
    skillsFit: 90,
    seniorityFit: 85,
    rateFit: 90,
    locationFit: 90,
    engagementFit: 80,
    scoreClass: overall >= 80 ? "strong" : overall >= 60 ? "possible" : "weak",
    rationale: "Excellent overlap with your RAG work. More detail here.",
    redFlags: [],
    serviceLines: [],
    model: "haiku",
  });
  return { ...ctx, offer: getOffer(ctx.db, id!)!, score };
}
