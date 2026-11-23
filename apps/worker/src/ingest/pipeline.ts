import {
  UNKNOWN_COMPANY,
  isIdLikeCompany,
  normalizeCompany,
  normalizeTitle,
  normalizedOfferSchema,
  TITLE_NORMALIZER_VERSION,
  prefilter,
  remoteOnlyReason,
  type NormalizedOfferInput,
  type Preferences,
} from "@job-radar/core";
import {
  addOfferLink,
  correctOfferCompany,
  findOfferByExternalId,
  findOfferBySourceExternalId,
  findRecentDuplicate,
  getSetting,
  insertOffer,
  recomputeNormalizedTitles,
  setSetting,
  touchOffer,
  upsertCompany,
  type Db,
} from "@job-radar/db";

export const DEDUPE_WINDOW_DAYS = 14;

/** No real company: the placeholder, or an id given as the name (simpleapply-dover-fixes D2). */
const unknownCompany = (name: string) => name === UNKNOWN_COMPANY || isIdLikeCompany(name);

export interface IngestCounts {
  found: number;
  newCount: number;
  filtered: number;
  duplicates: number;
  updated: number;
  invalid: number;
  newOfferIds: number[];
}

const TITLE_VERSION_KEY = "title_normalizer_version";

/**
 * When title normalization changed since the last start, stored titles are recomputed once so
 * new postings match older offers (simpleapply-dover-fixes D5). Returns how many changed.
 */
export function renormalizeTitles(db: Db): number | null {
  if (getSetting<number>(db, TITLE_VERSION_KEY) === TITLE_NORMALIZER_VERSION) return null;
  const changed = recomputeNormalizedTitles(db, normalizeTitle);
  setSetting(db, TITLE_VERSION_KEY, TITLE_NORMALIZER_VERSION);
  return changed;
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
  options: {
    prefilter?: boolean;
    /**
     * The source shares external ids with another source (MyGreenhouse and the Greenhouse boards
     * both use `<board>:<jobId>`): an offer known under that id from any source is only linked.
     */
    crossSourceIds?: boolean;
  } = {},
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
      if (unknownCompany(known.companyName) && !unknownCompany(o.companyName)) {
        const company = upsertCompany(db, {
          name: o.companyName,
          normalizedName: normalizeCompany(o.companyName),
          website: o.companyWebsite,
        });
        // The SimpleApply summary is replaced by a full description when one came with the name.
        const summaryOnly = known.description.startsWith("SimpleApply match");
        correctOfferCompany(db, known.id, {
          companyId: company.id,
          companyName: o.companyName,
          companyWebsite: o.companyWebsite ?? known.companyWebsite,
          description:
            summaryOnly && o.description !== known.description ? o.description : undefined,
        });
        log(`Company of "${known.title}" corrected to ${o.companyName}`);
      }
      counts.updated++;
      continue;
    }

    // 1b. Same external id from another source sharing the id space (job-ingestion spec).
    if (options.crossSourceIds) {
      const other = findOfferByExternalId(db, o.externalId);
      if (other) {
        addOfferLink(db, other.id, { sourceId, externalId: o.externalId, url: o.sourceUrl });
        counts.updated++;
        continue;
      }
    }

    // 2. Same company + normalized title within 14 days: link it to the existing offer.
    const company = upsertCompany(db, {
      name: o.companyName,
      normalizedName: normalizeCompany(o.companyName),
      website: o.companyWebsite,
      meta: Object.keys(o.companyMeta).length ? o.companyMeta : undefined,
    });
    const normalizedTitle = normalizeTitle(o.title);
    // Offers without a real company are never matched by title: they may be different companies.
    const dup = unknownCompany(o.companyName)
      ? undefined
      : findRecentDuplicate(db, company.id, normalizedTitle, since);
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
    if (!filterReason && options.prefilter !== false)
      filterReason = remoteOnlyReason(o, prefs.location);

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
