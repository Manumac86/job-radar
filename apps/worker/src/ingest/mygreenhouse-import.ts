import type { NormalizedOfferInput, Preferences } from "@job-radar/core";
import type { Db } from "@job-radar/db";
import { MYGREENHOUSE_SOURCE_ID } from "@job-radar/sources";
import { ingestOffers, type IngestCounts } from "./pipeline";

/**
 * Stores MyGreenhouse offers (mygreenhouse-source D3): ids shared with the Greenhouse boards are
 * only linked; jobs the owner applied to skip the pre-filter, since they become applications.
 */
export function ingestMyGreenhouse(
  db: Db,
  prefs: Preferences,
  offers: NormalizedOfferInput[],
  now: Date,
  log: (line: string) => void = () => {},
): IngestCounts {
  const applied = offers.filter((o) => o.companyMeta?.["via"] === "MyGreenhouse applications");
  const others = offers.filter((o) => !applied.includes(o));
  const a = ingestOffers(db, MYGREENHOUSE_SOURCE_ID, applied, prefs, now, log, {
    prefilter: false,
    crossSourceIds: true,
  });
  const b = ingestOffers(db, MYGREENHOUSE_SOURCE_ID, others, prefs, now, log, {
    crossSourceIds: true,
  });
  return {
    found: a.found + b.found,
    newCount: a.newCount + b.newCount,
    filtered: a.filtered + b.filtered,
    duplicates: a.duplicates + b.duplicates,
    updated: a.updated + b.updated,
    invalid: a.invalid + b.invalid,
    newOfferIds: [...a.newOfferIds, ...b.newOfferIds],
  };
}
