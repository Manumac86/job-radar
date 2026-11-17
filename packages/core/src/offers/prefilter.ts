export interface PrefilterInput {
  title: string;
  description: string;
  skills?: string[];
  companyName?: string;
}

export interface Keywords {
  include: string[];
  /** Entries prefixed with "title:" only match the title (e.g. "title:junior"). */
  exclude: string[];
  /** When non-empty, the title must contain one of these (role gate). */
  title_include?: string[];
  /** Companies to hide; a name matches as whole words ("Crossover" hides "Crossover for Work"). */
  exclude_companies?: string[];
}

export type PrefilterResult =
  | { pass: true; matchedInclude: string[] }
  | { pass: false; reason: string; keyword: string | null };

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive match that respects word edges even for "Next.js" or "C++". */
export function keywordRegex(keyword: string): RegExp {
  const k = escape(keyword.trim()).replace(/\s+/g, "[\\s-]+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${k}(?![\\p{L}\\p{N}])`, "iu");
}

/** The excluded-company entry that matches this company name, or null. */
export function excludedCompany(companyName: string, excluded: string[] = []): string | null {
  return excluded.find((c) => c.trim() && keywordRegex(c).test(companyName)) ?? null;
}

export function excludedCompanyReason(company: string): string {
  return `Excluded company "${company}"`;
}

/** Keyword pre-filter run before any LLM call (job-ingestion spec). */
export function prefilter(offer: PrefilterInput, keywords: Keywords): PrefilterResult {
  const title = offer.title;
  const company = offer.companyName
    ? excludedCompany(offer.companyName, keywords.exclude_companies)
    : null;
  if (company) return { pass: false, keyword: company, reason: excludedCompanyReason(company) };
  const everything = [offer.title, offer.description, ...(offer.skills ?? [])].join("\n");
  for (const raw of keywords.exclude) {
    const titleOnly = raw.startsWith("title:");
    const kw = titleOnly ? raw.slice("title:".length) : raw;
    if (!kw.trim()) continue;
    if (keywordRegex(kw).test(titleOnly ? title : everything)) {
      return {
        pass: false,
        keyword: kw,
        reason: `Excluded keyword "${kw}"${titleOnly ? " in title" : ""}`,
      };
    }
  }
  if (
    keywords.title_include?.length &&
    !keywords.title_include.some((kw) => keywordRegex(kw).test(title))
  ) {
    return { pass: false, keyword: null, reason: "Title is not a target role" };
  }
  const matched = keywords.include.filter((kw) => keywordRegex(kw).test(everything));
  if (keywords.include.length && matched.length === 0) {
    return { pass: false, keyword: null, reason: "No include keyword matched" };
  }
  return { pass: true, matchedInclude: matched };
}
