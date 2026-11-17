// Grounding (design D3): a fact survives only with a source the reader actually served in this
// research. A search snippet alone is never a source. Text aimed at a model is dropped.
import { INSTRUCTION_LIKE } from "../offers/feedback";
import { PROFILE_FACT_KEYS, emptyCompanyProfile, type CompanyProfile } from "./schema";
import { normalizeSourceUrl } from "./urls";

export interface GroundResult {
  profile: CompanyProfile;
  /** Facts, news items and red flags removed, with why. */
  dropped: { field: string; why: "unread source" | "instruction-like text" | "too old" }[];
}

const NEWS_MAX_AGE_DAYS = 366;

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

function looksLikeInstruction(v: unknown): boolean {
  return strings(v).some((s) => INSTRUCTION_LIKE.test(s));
}

/** "2026-03" or "2026-03-14" → a Date (first of month when the day is missing). */
export function parseFactDate(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function groundCompanyProfile(
  raw: CompanyProfile,
  readUrls: ReadonlySet<string>,
  now = new Date(),
): GroundResult {
  const dropped: GroundResult["dropped"] = [];
  const isRead = (u: string) => {
    const n = normalizeSourceUrl(u);
    return n !== null && readUrls.has(n);
  };
  const out = emptyCompanyProfile();
  const site = raw.website ? normalizeSourceUrl(raw.website) : null;
  out.website = site && raw.website ? raw.website.trim() : null;

  for (const key of PROFILE_FACT_KEYS) {
    const f = raw[key];
    if (!f) continue;
    const sources = [...new Set(f.sources.map((s) => s.trim()).filter(isRead))].slice(0, 3);
    if (!sources.length) {
      dropped.push({ field: key, why: "unread source" });
      continue;
    }
    if (looksLikeInstruction(f.value)) {
      dropped.push({ field: key, why: "instruction-like text" });
      continue;
    }
    (out as Record<string, unknown>)[key] = { value: f.value, sources };
  }

  const oldest = now.getTime() - NEWS_MAX_AGE_DAYS * 864e5;
  for (const n of raw.news) {
    const date = parseFactDate(n.date);
    if (!isRead(n.source)) dropped.push({ field: "news", why: "unread source" });
    else if (looksLikeInstruction(n.headline))
      dropped.push({ field: "news", why: "instruction-like text" });
    else if (!date || date.getTime() < oldest || date.getTime() > now.getTime() + 864e5)
      dropped.push({ field: "news", why: "too old" });
    else
      out.news.push({ date: n.date.trim(), headline: n.headline.trim(), source: n.source.trim() });
  }
  out.news.sort((a, b) => b.date.localeCompare(a.date));

  for (const r of raw.red_flags) {
    if (!isRead(r.source)) dropped.push({ field: "red_flags", why: "unread source" });
    else if (looksLikeInstruction(r.text))
      dropped.push({ field: "red_flags", why: "instruction-like text" });
    else out.red_flags.push({ text: r.text.trim(), source: r.source.trim() });
  }
  return { profile: out, dropped };
}

/** True when the profile has no fact at all. */
export function isEmptyProfile(p: CompanyProfile): boolean {
  return PROFILE_FACT_KEYS.every((k) => p[k] === null) && !p.news.length && !p.red_flags.length;
}
