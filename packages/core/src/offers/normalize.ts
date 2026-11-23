const COMPANY_SUFFIXES =
  /\b(inc|incorporated|ltd|limited|llc|l\.l\.c|gmbh|ag|bv|b\.v|sas|sarl|s\.l|sl|s\.a|sa|srl|corp|corporation|co|company|plc|oy|ab|as|pty|pte)\b\.?/g;

function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Acme.ai, Inc." → "acme ai". Used to match the same company across sources. */
export function normalizeCompany(name: string): string {
  return fold(name)
    .replace(/&/g, " and ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\./g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Bumped when normalizeTitle changes, so stored titles are recomputed (simpleapply-dover-fixes D5). */
export const TITLE_NORMALIZER_VERSION = 2;

/** Words that only state work mode or contract type (simpleapply-dover-fixes D4). */
const QUALIFIER_WORDS = new Set(
  (
    "remote hybrid onsite on site office contract contractor freelance freelancer full part time " +
    "permanent temporary temp international global worldwide anywhere fully only emea europe eu " +
    "us usa uk latam apac americas"
  ).split(" "),
);

/** Separators between title segments; a hyphen inside a word ("Full-Stack") is not one. */
const SEGMENT_SEPARATOR = /\s+[-–—]+\s*|\s*[-–—]+\s+|\s*[|,/·:]\s*/;

const isQualifierSegment = (segment: string) => {
  const words = segment.split(/[^a-z0-9]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => QUALIFIER_WORDS.has(w));
};

/** Drops trailing segments such as "- Contract" or "| Remote - Full Time"; the first is kept. */
function dropTrailingQualifiers(title: string): string {
  const segments = title.split(SEGMENT_SEPARATOR);
  while (segments.length > 1 && isQualifierSegment(segments[segments.length - 1] ?? ""))
    segments.pop();
  return segments.join(" ");
}

/** "Sr. AI Engineer (Remote, EU) – m/f/d" → "senior ai engineer". */
export function normalizeTitle(title: string): string {
  const base = fold(title)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(m\/f\/d|m\/w\/d|f\/m\/d|h\/f|m\/f)\b/g, " ");
  return dropTrailingQualifiers(base)
    .replace(/&/g, " and ")
    .replace(/\bsr\b\.?/g, "senior")
    .replace(/\bjr\b\.?/g, "junior")
    .replace(/\b(remote|hybrid|anywhere|worldwide|emea|europe|eu|us|usa|uk)\b/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** The label for an offer whose company is not known. */
export const UNKNOWN_COMPANY = "Unknown company";

/**
 * A company "name" that is only an identifier: a UUID (with dashes or spaces, any case) or a
 * run of 16+ hex characters (simpleapply-dover-fixes D2).
 */
export function isIdLikeCompany(name: string): boolean {
  const n = name.trim();
  return (
    /^[0-9a-f]{8}[\s-][0-9a-f]{4}[\s-][0-9a-f]{4}[\s-][0-9a-f]{4}[\s-][0-9a-f]{12}$/i.test(n) ||
    /^[0-9a-f]{16,}$/i.test(n)
  );
}

/** Plain text from HTML-ish source text without pulling a DOM parser into core. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
