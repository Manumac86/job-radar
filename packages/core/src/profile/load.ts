import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  YAMLParseError,
  isCollection,
  isMap,
  isNode,
  isScalar,
  parseDocument,
  stringify,
  type Document,
  type Node,
  type Pair,
} from "yaml";
import { z } from "zod";
import { formatIssues, preferencesSchema, type Preferences, type Profile } from "./schema";
import { loadVariants } from "./variants";

export const PREFERENCES_FILE = "preferences.yaml";
export const CV_FILE = "cv.md";

export type ProfileLoadResult =
  | {
      ok: true;
      profile: Profile;
      cvHash: string;
      preferencesHash: string;
      variantsHash: string;
      /** Variant files that were skipped; they do not make the profile invalid. */
      variantErrors: string[];
    }
  | { ok: false; status: "invalid" | "missing"; errors: string[] };

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Validates preferences YAML text. Errors are one readable line per problem. */
export function parsePreferences(
  text: string,
): { ok: true; value: Preferences } | { ok: false; errors: string[] } {
  const doc = parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    return {
      ok: false,
      errors: doc.errors.map((e: YAMLParseError) => {
        const line = e.linePos?.[0];
        return `${PREFERENCES_FILE}${line ? ` line ${line.line}` : ""}: ${e.message.split("\n")[0]}`;
      }),
    };
  }
  const parsed = preferencesSchema.safeParse(doc.toJS());
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };
  return { ok: true, value: parsed.data };
}

export function loadProfile(dir: string, now = new Date()): ProfileLoadResult {
  const prefsPath = join(/*turbopackIgnore: true*/ dir, PREFERENCES_FILE);
  const cvPath = join(/*turbopackIgnore: true*/ dir, CV_FILE);
  const missing = [prefsPath, cvPath].filter((p) => !existsSync(p));
  if (missing.length) {
    return { ok: false, status: "missing", errors: missing.map((p) => `${p}: file not found`) };
  }
  const prefsText = readFileSync(prefsPath, "utf8");
  const cv = readFileSync(cvPath, "utf8");
  const errors: string[] = [];
  if (!cv.trim()) errors.push(`${CV_FILE}: the CV is empty`);
  const prefs = parsePreferences(prefsText);
  if (!prefs.ok) errors.push(...prefs.errors);
  if (errors.length || !prefs.ok) return { ok: false, status: "invalid", errors };
  const variants = loadVariants(dir);
  return {
    ok: true,
    profile: { preferences: prefs.value, cv, variants: variants.variants, loadedAt: now },
    variantsHash: variants.hash,
    variantErrors: variants.errors,
    cvHash: sha(cv),
    preferencesHash: sha(prefsText),
  };
}

/** First run: copies the seed CV and preferences into the data directory if absent. */
export function ensureProfileFiles(dir: string, seedDir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const copied: string[] = [];
  for (const file of [PREFERENCES_FILE, CV_FILE, "companies.yaml"]) {
    const target = join(/*turbopackIgnore: true*/ dir, file);
    const seed = join(/*turbopackIgnore: true*/ seedDir, file);
    if (!existsSync(target) && existsSync(seed)) {
      copyFileSync(seed, target);
      copied.push(target);
    }
  }
  return copied;
}

export function readProfileFiles(dir: string): { preferences: string; cv: string } {
  return {
    preferences: readFileSync(join(/*turbopackIgnore: true*/ dir, PREFERENCES_FILE), "utf8"),
    cv: readFileSync(join(/*turbopackIgnore: true*/ dir, CV_FILE), "utf8"),
  };
}

/**
 * Saves edited profile files after validating them. Nothing is written when the
 * preferences are invalid, so a bad edit cannot break scoring.
 */
export function saveProfileFiles(
  dir: string,
  files: { preferences?: string; cv?: string },
): { ok: true } | { ok: false; errors: string[] } {
  if (files.preferences !== undefined) {
    const parsed = parsePreferences(files.preferences);
    if (!parsed.ok) return parsed;
  }
  if (files.cv !== undefined && !files.cv.trim()) {
    return { ok: false, errors: [`${CV_FILE}: the CV is empty`] };
  }
  mkdirSync(dir, { recursive: true });
  if (files.preferences !== undefined)
    writeFileSync(join(/*turbopackIgnore: true*/ dir, PREFERENCES_FILE), files.preferences);
  if (files.cv !== undefined) writeFileSync(join(/*turbopackIgnore: true*/ dir, CV_FILE), files.cv);
  return { ok: true };
}

/** One edit to preferences.yaml: set a value, or delete an optional key. */
export type PreferenceChange =
  { path: (string | number)[]; value: unknown } | { path: (string | number)[]; delete: true };

/** A validation problem tied to a field path such as `scoring.thresholds` ("" for the whole file). */
export interface PreferenceFieldError {
  path: string;
  message: string;
}

export type PreferenceChangeResult =
  | { ok: true; text: string; value: Preferences }
  | { ok: false; errors: string[]; fieldErrors: PreferenceFieldError[] };

/**
 * Applies changes as targeted text edits, so comments, key order and the formatting
 * of every untouched line stay byte-identical. A replaced list or map keeps the
 * flow (`[a, b]`) or block style of the node it replaces. Validates before returning.
 */
export function applyPreferenceChanges(
  text: string,
  changes: PreferenceChange[],
): PreferenceChangeResult {
  let next = text;
  for (const c of changes) {
    const doc = parseDocument(next);
    if (doc.errors.length) return syntaxErrors(next);
    next = "delete" in c ? deleteAt(doc, next, c.path) : setAt(doc, next, c.path, c.value);
  }
  const doc = parseDocument(next, { prettyErrors: true });
  if (doc.errors.length) return syntaxErrors(next);
  const parsed = preferencesSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    return {
      ok: false,
      errors: formatIssues(parsed.error),
      fieldErrors: parsed.error.issues.map((i) => ({
        path: i.path.map(String).join("."),
        message: (formatIssues(new z.ZodError([i]))[0] ?? i.message).replace(/^[^:]*: /, ""),
      })),
    };
  }
  return { ok: true, text: next, value: parsed.data };
}

type YamlPath = (string | number)[];

function syntaxErrors(text: string): PreferenceChangeResult {
  const doc = parseDocument(text, { prettyErrors: true });
  const errors = doc.errors.map((e: YAMLParseError) => {
    const line = e.linePos?.[0];
    return `${PREFERENCES_FILE}${line ? ` line ${line.line}` : ""}: ${e.message.split("\n")[0]}`;
  });
  return { ok: false, errors, fieldErrors: errors.map((message) => ({ path: "", message })) };
}

function pairAt(doc: Document, path: YamlPath): { parent: unknown; pair: Pair | undefined } {
  const parent = path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents;
  const key = path[path.length - 1];
  const pair = isMap(parent)
    ? parent.items.find((p) => isScalar(p.key) && p.key.value === key)
    : undefined;
  return { parent, pair };
}

const keyEnd = (pair: Pair) => (isNode(pair.key) ? (pair.key.range?.[1] ?? 0) : 0);
const lineStart = (text: string, i: number) => text.lastIndexOf("\n", i - 1) + 1;
const column = (text: string, i: number) => i - lineStart(text, i);
/** End of a node's value, before any trailing whitespace or newlines. */
function valueEnd(text: string, node: Node): number {
  const [start = 0, stop = 0] = node.range ?? [];
  let end = stop;
  while (end > start && /\s/.test(text.charAt(end - 1))) end--;
  return end;
}

function flowText(value: unknown, padded: boolean): string {
  return stringify(value, {
    collectionStyle: "flow",
    flowCollectionPadding: padded,
    lineWidth: 0,
  }).trimEnd();
}

function blockText(value: unknown, indent: number): string {
  const lines = stringify(value, { collectionStyle: "block", lineWidth: 0 }).trimEnd().split("\n");
  return lines.map((l, i) => (i === 0 ? l : " ".repeat(indent) + l)).join("\n");
}

function setAt(doc: Document, text: string, path: YamlPath, value: unknown): string {
  const { parent, pair } = pairAt(doc, path);
  const isCollectionValue = value !== null && typeof value === "object";
  const prev = pair?.value;
  if (pair && isNode(prev) && prev.range) {
    const start = prev.range[0];
    const end = valueEnd(text, prev);
    const original = text.slice(start, end);
    let replacement: string;
    if (!isCollectionValue) {
      // Keep the original quoting of a string ("09:15" stays quoted).
      if (typeof value === "string" && original.startsWith('"'))
        replacement = JSON.stringify(value);
      else if (typeof value === "string" && original.startsWith("'"))
        replacement = `'${value.replace(/'/g, "''")}'`;
      else replacement = stringify(value, { lineWidth: 0 }).trimEnd();
    } else if (isCollection(prev) && !prev.flow) {
      const empty = Array.isArray(value) ? !value.length : !Object.keys(value).length;
      if (empty) {
        // A block collection cannot be empty: write `key: []` on the key's line.
        const colon = text.indexOf(":", keyEnd(pair));
        return (
          text.slice(0, colon + 1) + ` ${Array.isArray(value) ? "[]" : "{}"}` + text.slice(end)
        );
      }
      replacement = blockText(value, column(text, start));
    } else {
      const padded = /^[[{] /.test(original) || (isMap(prev) && !/^[[{]\S/.test(original));
      replacement = flowText(value, padded);
    }
    return text.slice(0, start) + replacement + text.slice(end);
  }
  if (pair) {
    // `key:` with an empty value: write after the colon.
    const colon = text.indexOf(":", keyEnd(pair));
    const lineEnd = text.indexOf("\n", colon);
    const at = lineEnd === -1 ? text.length : lineEnd;
    const v = isCollectionValue ? flowText(value, false) : stringify(value).trimEnd();
    return text.slice(0, colon + 1) + ` ${v}` + text.slice(at);
  }
  if (isMap(parent) && parent.range) {
    const key = String(path[path.length - 1]);
    if (parent.flow) {
      const current = (parent.toJSON() ?? {}) as Record<string, unknown>;
      return setAt(doc, text, path.slice(0, -1), { ...current, [key]: value });
    }
    const first = parent.items[0]?.key as Node | undefined;
    const indent = first?.range ? column(text, first.range[0]) : 0;
    const end = valueEnd(text, parent);
    const v = isCollectionValue
      ? Array.isArray(value) && value.length && typeof value[0] !== "object"
        ? ` ${flowText(value, false)}`
        : `\n${" ".repeat(indent + 2)}${blockText(value, indent + 2)}`
      : ` ${stringify(value).trimEnd()}`;
    return text.slice(0, end) + `\n${" ".repeat(indent)}${key}:${v}` + text.slice(end);
  }
  if (path.length > 1) {
    return setAt(doc, text, path.slice(0, -1), { [String(path[path.length - 1])]: value });
  }
  const sep = text.endsWith("\n") || !text ? "" : "\n";
  return `${text}${sep}${String(path[0])}:${
    isCollectionValue ? `\n  ${blockText(value, 2)}` : ` ${stringify(value).trimEnd()}`
  }\n`;
}

function deleteAt(doc: Document, text: string, path: YamlPath): string {
  const { parent, pair } = pairAt(doc, path);
  if (!pair || !isMap(parent)) return text;
  if (parent.flow) {
    const key = String(path[path.length - 1]);
    const current = Object.fromEntries(
      Object.entries(parent.toJSON() as Record<string, unknown>).filter(([k]) => k !== key),
    );
    return setAt(doc, text, path.slice(0, -1), current);
  }
  const keyNode = pair.key as Node;
  const from = lineStart(text, keyNode.range?.[0] ?? 0);
  const valueNode = isNode(pair.value) ? pair.value : keyNode;
  const lineEnd = text.indexOf("\n", valueEnd(text, valueNode));
  return text.slice(0, from) + text.slice(lineEnd === -1 ? text.length : lineEnd + 1);
}

/**
 * Updates individual preference values in place, keeping comments and layout.
 * `path` is a list of keys, e.g. ["rates", "min_hourly", "EUR"].
 */
export function setPreferenceValues(
  text: string,
  updates: { path: (string | number)[]; value: unknown }[],
): { ok: true; text: string } | { ok: false; errors: string[] } {
  const r = applyPreferenceChanges(text, updates);
  return r.ok ? { ok: true, text: r.text } : { ok: false, errors: r.errors };
}
