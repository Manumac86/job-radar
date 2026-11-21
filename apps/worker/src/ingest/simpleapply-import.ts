import type { NormalizedOfferInput, Preferences } from "@job-radar/core";
import {
  createApplication,
  findOfferByExternalId,
  getApplicationForOffer,
  getSource,
  upsertSource,
  type Db,
} from "@job-radar/db";
import {
  SIMPLEAPPLY_SOURCE_ID,
  SimpleApplyCsvError,
  appliedAtOf,
  parseSimpleApplyCsv,
  type MappedMatch,
} from "@job-radar/sources";
import type { WorkerContext } from "../context";
import { log } from "../log";
import { ingestOffers, type IngestCounts } from "./pipeline";

export { SimpleApplyCsvError };

export interface SimpleApplyImportResult {
  found: number;
  new: number;
  duplicates: number;
  filtered: number;
  invalid: number;
  applications: number;
}

/** The source row exists even before the adapter syncs (tests, a fresh database). */
function ensureSource(ctx: WorkerContext): void {
  if (getSource(ctx.db, SIMPLEAPPLY_SOURCE_ID)) return;
  upsertSource(ctx.db, {
    id: SIMPLEAPPLY_SOURCE_ID,
    type: "simpleapply",
    name: "SimpleApply (logged-in)",
    enabled: false,
    requiresLogin: true,
    status: "logged_out",
    intervalMinutes: 720,
  });
}

export interface SimpleApplyIngest extends IngestCounts {
  applications: number;
}

/**
 * Stores SimpleApply matches (CSV rows or dashboard jobs) under the `simpleapply` source: the usual
 * de-duplication, pre-filter and scoring; applied matches skip the pre-filter and get an
 * application unless they already have one (design D4).
 */
export function ingestSimpleApply(
  db: Db,
  prefs: Preferences,
  matches: MappedMatch[],
  now: Date,
  logLine: (line: string) => void = () => {},
): SimpleApplyIngest {
  const total: SimpleApplyIngest = {
    found: 0,
    newCount: 0,
    filtered: 0,
    duplicates: 0,
    updated: 0,
    invalid: 0,
    newOfferIds: [],
    applications: 0,
  };
  const add = (c: IngestCounts) => {
    total.found += c.found;
    total.newCount += c.newCount;
    total.filtered += c.filtered;
    total.duplicates += c.duplicates;
    total.updated += c.updated;
    total.invalid += c.invalid;
    total.newOfferIds.push(...c.newOfferIds);
  };
  const applied = matches.filter((m) => m.appliedAt);
  const open = matches.filter((m) => !m.appliedAt);
  if (open.length)
    add(
      ingestOffers(
        db,
        SIMPLEAPPLY_SOURCE_ID,
        open.map((m) => m.offer),
        prefs,
        now,
        logLine,
      ),
    );
  if (applied.length)
    add(
      ingestOffers(
        db,
        SIMPLEAPPLY_SOURCE_ID,
        applied.map((m) => m.offer),
        prefs,
        now,
        logLine,
        {
          prefilter: false,
        },
      ),
    );
  for (const m of applied) {
    const offer = findOfferByExternalId(db, m.offer.externalId);
    if (!offer || !m.appliedAt || getApplicationForOffer(db, offer.id)) continue;
    createApplication(db, {
      offerId: offer.id,
      at: m.appliedAt,
      note: "Applied through SimpleApply",
    });
    total.applications++;
  }
  return total;
}

/** Offers returned by the logged-in adapter, back to matches (the applied date travels in `raw`). */
export function matchesFromOffers(offers: NormalizedOfferInput[]): MappedMatch[] {
  return offers.map((offer) => ({ offer, appliedAt: appliedAtOf(offer) }));
}

/**
 * Imports a SimpleApply "Export CSV" file (job-ingestion spec, "SimpleApply CSV import";
 * design D3/D4). Reads only the given text: no network request is made.
 */
export function importSimpleApplyCsv(
  ctx: WorkerContext,
  text: string,
  now = new Date(),
): SimpleApplyImportResult {
  const profile = ctx.profile.get();
  if (!profile) throw new SimpleApplyCsvError("Profile is invalid; fix it in Settings first");
  const { matches, invalid } = parseSimpleApplyCsv(text, now);
  ensureSource(ctx);
  const c = ingestSimpleApply(ctx.db, profile.preferences, matches, now, (line) =>
    log.info("simpleapply import", { line }),
  );
  const result: SimpleApplyImportResult = {
    found: matches.length + invalid,
    new: c.newCount - c.filtered,
    duplicates: c.duplicates + c.updated,
    filtered: c.filtered,
    invalid: invalid + c.invalid,
    applications: c.applications,
  };
  if (c.newOfferIds.length) ctx.scoring?.enqueue(c.newOfferIds);
  log.info("simpleapply csv imported", { ...result });
  return result;
}
