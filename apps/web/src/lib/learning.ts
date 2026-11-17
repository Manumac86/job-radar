import "server-only";
import {
  countPendingFeedback,
  getOffer,
  learningState,
  listLearnedPreferences,
  openOfferIds,
  pendingSuggestions,
  rescoreSuggested,
} from "@job-radar/db";
import type { LearningData } from "@/app/settings/learning-panel";
import { db } from "@/lib/db";
import { readPreferences } from "@/lib/profile";

/** Rescore banner state for the offers list and Settings. */
export function rescoreBanner(): LearningData["rescore"] {
  const d = db();
  const suggested = rescoreSuggested(d);
  return { suggested, openOffers: suggested ? openOfferIds(d).length : 0 };
}

export function learningData(): LearningData {
  const d = db();
  const rates = readPreferences().prefs?.rates;
  return {
    preferences: listLearnedPreferences(d).map((p) => ({
      id: p.id,
      text: p.text,
      polarity: p.polarity,
      status: p.status,
      origin: p.origin,
      evidenceCount: p.evidence.length,
      evidence: p.evidence.slice(0, 10).flatMap((id) => {
        const o = getOffer(d, id);
        return o ? [{ id: o.id, title: o.title, company: o.companyName }] : [];
      }),
    })),
    suggestions: pendingSuggestions(d).map((s) => ({
      id: s.id,
      kind: s.kind,
      currency: s.currency,
      value: s.value,
      evidenceCount: s.evidence.length,
      current:
        s.kind === "raise_min_hourly"
          ? (rates?.min_hourly[s.currency] ?? null)
          : (rates?.min_daily_eur ?? null),
    })),
    pendingFeedback: countPendingFeedback(d),
    lastRunAt: learningState(d).lastRunAt,
    rescore: rescoreBanner(),
  };
}
