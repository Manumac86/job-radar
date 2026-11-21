// Cleans a reply body before it goes to the model (application-emails D2): quoted history and
// signatures' reply chains are removed, then the text is truncated.

export const MAX_BODY_CHARS = 6_000;

/** Lines that start the quoted previous message in common mail clients. */
const QUOTE_HEADERS: RegExp[] = [
  /^on .{3,200} wrote:\s*$/i, // Gmail / Apple Mail (EN)
  /^el .{3,200} escribi[oó]:\s*$/i, // Spanish
  /^le .{3,200} a écrit\s*:\s*$/i, // French
  /^am .{3,200} schrieb .{0,100}:\s*$/i, // German
  /^-{2,}\s*original message\s*-{2,}\s*$/i,
  /^-{2,}\s*mensaje original\s*-{2,}\s*$/i,
  /^_{10,}\s*$/, // Outlook separator line
  /^-{2,}\s*forwarded message\s*-{2,}\s*$/i,
];

/** Outlook-style header block: "From:" followed within two lines by "Sent:" or "Date:". */
function isOutlookHeader(lines: string[], i: number): boolean {
  if (!/^(from|de)\s*:/i.test(lines[i] ?? "")) return false;
  return lines.slice(i + 1, i + 3).some((l) => /^(sent|date|enviado|fecha)\s*:/i.test(l.trim()));
}

export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (QUOTE_HEADERS.some((r) => r.test(line)) || isOutlookHeader(lines, i)) break;
    if (line.startsWith(">")) continue;
    out.push(lines[i] ?? "");
  }
  return out
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanReplyBody(text: string, max = MAX_BODY_CHARS): string {
  const stripped = stripQuoted(text);
  return stripped.length > max ? `${stripped.slice(0, max)}\n[…truncated]` : stripped;
}
