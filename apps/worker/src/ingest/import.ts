import { normalizeCompany, normalizeTitle } from "@job-radar/core";
import {
  addOfferLink,
  createApplication,
  findOfferByExternalId,
  findRecentDuplicate,
  getOffer,
  getSource,
  setScoreStatus,
  setTriage,
  upsertCompany,
  upsertSource,
  type Db,
} from "@job-radar/db";
import {
  ImportError,
  MANUAL_SOURCE_ID,
  createPoliteFetcher,
  importOfferFromUrl,
  type PoliteFetcher,
} from "@job-radar/sources";
import type { WorkerContext } from "../context";
import { log } from "../log";
import { ingestOffers } from "./pipeline";

export { ImportError };

export interface ImportRequest {
  url: string;
  text?: string | null;
  /** The owner already applied outside the app: create the application too. */
  appliedAt?: Date | null;
}

export interface ImportResponse {
  offerId: number;
  existed: boolean;
  applicationId: number | null;
  method: string;
}

export function ensureManualSource(db: Db): void {
  if (getSource(db, MANUAL_SOURCE_ID)) return;
  upsertSource(db, {
    id: MANUAL_SOURCE_ID,
    type: "manual",
    name: "Added by you",
    enabled: false,
    intervalMinutes: 0,
  });
}

/**
 * Imports one offer from a link (job-ingestion spec, "Manual import"): finds it if Job Radar
 * already has it (from any source), otherwise stores it without the pre-filter and queues it
 * for scoring. Optionally records that the owner already applied.
 */
export async function importOffer(
  ctx: WorkerContext,
  req: ImportRequest,
  deps: { fetcher?: PoliteFetcher; now?: Date } = {},
): Promise<ImportResponse> {
  const { db } = ctx;
  const profile = ctx.profile.get();
  if (!profile) throw new ImportError("Profile is invalid; fix it in Settings first");
  const now = deps.now ?? new Date();
  const fetcher = deps.fetcher ?? createPoliteFetcher({ maxRetries: 1, timeoutMs: 20_000 });
  const { offer, method } = await importOfferFromUrl(req.url, {
    fetcher,
    llm: ctx.llm ? { ...ctx.llm, model: profile.preferences.scoring.models.scoring } : null,
    pastedText: req.text ?? null,
    now,
    log: (line) => log.info("offer import", { line }),
  });
  ensureManualSource(db);

  let existing = findOfferByExternalId(db, offer.externalId);
  if (!existing) {
    const company = upsertCompany(db, {
      name: offer.companyName,
      normalizedName: normalizeCompany(offer.companyName),
    });
    existing = findRecentDuplicate(
      db,
      company.id,
      normalizeTitle(offer.title),
      new Date(now.getTime() - 60 * 86_400_000),
    );
    if (existing)
      addOfferLink(db, existing.id, {
        sourceId: MANUAL_SOURCE_ID,
        externalId: offer.externalId,
        url: offer.sourceUrl,
      });
  }

  let offerId: number;
  if (existing) {
    offerId = existing.id;
    // The owner chose this offer: bring it back if it was filtered or dismissed.
    if (
      existing.triage === "filtered" ||
      existing.triage === "dismissed" ||
      existing.triage === "archived"
    ) {
      setTriage(db, existing.id, "new", null);
      if (existing.scoreStatus === "not_scored") setScoreStatus(db, existing.id, "awaiting_score");
    }
  } else {
    const counts = ingestOffers(db, MANUAL_SOURCE_ID, [offer], profile.preferences, now, () => {}, {
      prefilter: false,
    });
    const id = counts.newOfferIds[0];
    if (!id) throw new ImportError("The offer could not be stored (missing title or company)");
    offerId = id;
  }

  const current = getOffer(db, offerId);
  if (current?.scoreStatus === "awaiting_score") ctx.scoring?.enqueue([offerId]);
  const application = req.appliedAt
    ? createApplication(db, { offerId, at: req.appliedAt, note: "Applied outside Job Radar" })
    : null;
  log.info("offer imported", { offerId, existed: Boolean(existing), method });
  return {
    offerId,
    existed: Boolean(existing),
    applicationId: application?.id ?? null,
    method,
  };
}
