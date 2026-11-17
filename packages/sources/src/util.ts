import { stripHtml } from "@job-radar/core";

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&amp;": "&",
};

/** Handles both raw HTML and HTML that was entity-escaped once (Greenhouse `content`). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const decoded = /&lt;\/?[a-z]/i.test(html)
    ? html.replace(/&(lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m] ?? m)
    : html;
  return stripHtml(decoded);
}

export function inferRemotePolicy(
  ...hints: (string | null | undefined | boolean)[]
): "remote" | "hybrid" | "onsite" | "unknown" {
  const text = hints
    .filter((h) => typeof h === "string")
    .join(" ")
    .toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (hints.includes(true) || /\bremote\b|anywhere|distributed|work from home|wfh/.test(text))
    return "remote";
  if (/on-?site|in-?office|onsite/.test(text)) return "onsite";
  return "unknown";
}

export function inferEngagement(
  ...hints: (string | null | undefined)[]
): "contract" | "part-time" | "full-time" | "freelance" | "unknown" {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  if (/freelance/.test(text)) return "freelance";
  if (/contract|contractor|fixed[- ]term|temporary|\bb2b\b/.test(text)) return "contract";
  if (/part[- ]?time/.test(text)) return "part-time";
  if (/full[- ]?time|permanent|fulltime/.test(text)) return "full-time";
  return "unknown";
}

const REGION_WORDS: [RegExp, string][] = [
  [/\b(worldwide|anywhere|global)\b/i, "Worldwide"],
  [/\bemea\b/i, "EMEA"],
  [/\b(europe|european)\b/i, "Europe"],
  [/\beu\b/i, "EU"],
  [/\b(spain|españa|madrid|barcelona)\b/i, "Spain"],
  [/\b(uk|united kingdom|london)\b/i, "UK"],
  [/\b(us|usa|united states|u\.s\.)\b/i, "US"],
  [/\b(canada)\b/i, "Canada"],
  [/\bnorth america\b/i, "North America"],
  [/\b(latam|latin america)\b/i, "LATAM"],
  [/\b(apac|asia)\b/i, "APAC"],
];

/** Regions as stated in a location string; nothing is inferred beyond the words used. */
export function regionsFrom(...locations: (string | null | undefined)[]): string[] {
  const text = locations.filter(Boolean).join(" | ");
  const out = new Set<string>();
  for (const [re, region] of REGION_WORDS) if (re.test(text)) out.add(region);
  return [...out];
}

export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
