/**
 * Minimal RFC 4180 parser: quoted fields, `""` escapes, CRLF or LF line ends, newlines inside
 * quoted fields and a leading BOM. Returns rows of raw strings; blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") endRow();
    else if (c === "\r") {
      if (src[i + 1] !== "\n") endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/** Rows as objects keyed by the (trimmed) header names. */
export function csvRecords(text: string): { header: string[]; records: Record<string, string>[] } {
  const [header = [], ...rows] = parseCsv(text);
  const names = header.map((h) => h.trim());
  return {
    header: names,
    records: rows.map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? "").trim()]))),
  };
}
