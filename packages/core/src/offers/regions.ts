// Owner-listed regions (location-preferred-regions D1): names match as whole words, ignoring
// case and accents, in the offer's location and regions only (never the description).
import { keywordRegex } from "./prefilter";

export interface RegionInput {
  location?: string | null;
  regions?: string[];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/** The first listed name found in the offer's location or regions, or null. */
export function regionMatch(offer: RegionInput, names: string[] = []): string | null {
  const places = [offer.location ?? "", ...(offer.regions ?? [])].filter((p) => p.trim()).map(fold);
  if (!places.length) return null;
  for (const name of names) {
    if (!name.trim()) continue;
    const re = keywordRegex(fold(name));
    if (places.some((p) => re.test(p))) return name;
  }
  return null;
}

/** The pre-filter reason for an offer that is not remote while the profile is remote-only. */
export function notRemoteReason(policy: string): string {
  return `Not remote (${policy})`;
}

/**
 * Remote-only rule (job-ingestion "Keyword pre-filter"): on-site offers are filtered, and
 * hybrid offers too unless they are located in one of the hybrid regions.
 */
export function remoteOnlyReason(
  offer: RegionInput & { remotePolicy: string },
  location: { remote_only: boolean; hybrid_regions?: string[] },
): string | null {
  if (!location.remote_only) return null;
  if (offer.remotePolicy === "onsite") return notRemoteReason("onsite");
  if (offer.remotePolicy === "hybrid" && !regionMatch(offer, location.hybrid_regions))
    return notRemoteReason("hybrid");
  return null;
}
