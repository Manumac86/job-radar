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

/** "Sr. AI Engineer (Remote, EU) – m/f/d" → "senior ai engineer". */
export function normalizeTitle(title: string): string {
  return fold(title)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(m\/f\/d|m\/w\/d|f\/m\/d|h\/f|m\/f)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/\bsr\b\.?/g, "senior")
    .replace(/\bjr\b\.?/g, "junior")
    .replace(/\b(remote|hybrid|anywhere|worldwide|emea|europe|eu|us|usa|uk)\b/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
