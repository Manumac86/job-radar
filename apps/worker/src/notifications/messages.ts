import { describeCompensation } from "@job-radar/core";
import type { Offer, Score } from "@job-radar/db";

export function offerRate(o: Offer): string {
  if (o.rateUnknown) return "rate unknown";
  return describeCompensation({
    min: o.compMin,
    max: o.compMax,
    currency: o.compCurrency,
    period: o.compPeriod,
  });
}

export function firstSentence(text: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(text.trim());
  return (m ? m[0] : text).trim().slice(0, 240);
}

/** Strong-match notification: once per offer thanks to the dedupe key. */
export function strongMatchNotification(offer: Offer, score: Score) {
  return {
    kind: "strong_match" as const,
    title: `Strong match ${score.overall}: ${offer.title} at ${offer.companyName}`,
    body: [
      `Score ${score.overall} · ${offerRate(offer)}`,
      firstSentence(score.rationale),
      score.redFlags.length ? `Red flags: ${score.redFlags.slice(0, 3).join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    offerId: offer.id,
    dedupeKey: `strong_match:${offer.id}`,
  };
}
