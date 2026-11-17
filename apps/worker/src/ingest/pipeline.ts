import {
  normalizeCompany,
  normalizeTitle,
  normalizedOfferSchema,
  prefilter,
  type NormalizedOfferInput,
  type Preferences,
} from "@job-radar/core";
import {
  addOfferLink,
  findOfferBySourceExternalId,
  findRecentDuplicate,
  insertOffer,
  touchOffer,
  upsertCompany,
  type Db,
} from "@job-radar/db";

export const DEDUPE_WINDOW_DAYS = 14;

export interface IngestCounts {
  found: number;
  newCount: number;
  filtered: number;
  duplicates: number;
  updated: number;
  invalid: number;
  newOfferIds: number[];
}

/**
 * Normalize → de-duplicate → pre-filter → store (job-ingestion spec).
 * Filtered offers are stored with the reason and never reach the LLM.
 */
export function ingestOffers(
  db: Db,
  sourceId: string,
  raw: NormalizedOfferInput[],
  prefs: Preferences,
  now = new Date(),
  log: (line: string) => void = () => {},
  /** Offers the owner added by hand skip the pre-filter: they chose them. */
  options: { prefilter?: boolean } = {},
): IngestCounts {
  const counts: IngestCounts = {
    found: raw.length,
    newCount: 0,
    filtered: 0,
    duplicates: 0,
    updated: 0,
    invalid: 0,
    newOfferIds: [],
  };
  const since = new Date(now.getTime() - DEDUPE_WINDOW_DAYS * 86_400_000);
  for (const input of raw) {
    const parsed = normalizedOfferSchema.safeParse({ ...input, sourceId });
    if (!parsed.success) {
      counts.invalid++;
      log(
        `Skipped invalid offer ${input.externalId ?? "?"}: ${parsed.error.issues[0]?.message ?? ""}`,
      );
      continue;
    }
    const o = parsed.data;

    // 1. Same source + external id: already known.
    const known = findOfferBySourceExternalId(db, sourceId, o.externalId);
    if (known) {
      touchOffer(db, known.id, now);
      counts.updated++;
      continue;
    }

    // 2. Same company + normalized title within 14 days: link it to the existing offer.
    const company = upsertCompany(db, {
      name: o.companyName,
      normalizedName: normalizeCompany(o.companyName),
      website: o.companyWebsite,
      meta: Object.keys(o.companyMeta).length ? o.companyMeta : undefined,
    });
    const normalizedTitle = normalizeTitle(o.title);
    const dup = findRecentDuplicate(db, company.id, normalizedTitle, since);
    if (dup) {
      addOfferLink(db, dup.id, { sourceId, externalId: o.externalId, url: o.sourceUrl });
      counts.duplicates++;
      continue;
    }

    // 3. Pre-filter before any LLM call.
    const keywordCheck =
      options.prefilter === false
        ? ({ pass: true, matchedInclude: [] } as const)
        : prefilter(o, prefs.keywords);
    let filterReason: string | null = keywordCheck.pass ? null : keywordCheck.reason;
    if (
      !filterReason &&
      options.prefilter !== false &&
      prefs.location.remote_only &&
      (o.remotePolicy === "onsite" || o.remotePolicy === "hybrid")
    ) {
      filterReason = `Not remote (${o.remotePolicy})`;
    }

    const comp = o.compensation;
    const offer = insertOffer(db, {
      sourceId,
      externalId: o.externalId,
      sourceUrl: o.sourceUrl,
      title: o.title,
      normalizedTitle,
      companyId: company.id,
      companyName: o.companyName,
      companyWebsite: o.companyWebsite,
      location: o.location,
      remotePolicy: o.remotePolicy,
      regions: o.regions,
      engagementType: o.engagementType,
      compMin: comp?.min ?? null,
      compMax: comp?.max ?? null,
      compCurrency: comp?.currency ?? null,
      compPeriod: comp?.period ?? null,
      rateUnknown: !comp || (comp.min === null && comp.max === null),
      equityMin: o.equityMin,
      equityMax: o.equityMax,
      postedAt: o.postedAt,
      description: o.description,
      skills: o.skills,
      applyMethod: o.applyMethod,
      applyUrl: o.applyUrl,
      companyMeta: o.companyMeta,
      raw: o.raw ?? null,
      triage: filterReason ? "filtered" : "new",
      triageReason: filterReason,
      scoreStatus: filterReason ? "not_scored" : "awaiting_score",
      firstSeenAt: now,
      lastSeenAt: now,
    });
    counts.newCount++;
    if (filterReason) counts.filtered++;
    else counts.newOfferIds.push(offer.id);
  }
  return counts;
}
