import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { YAMLParseError, parseDocument } from "yaml";
import { formatIssues, preferencesSchema, type Preferences, type Profile } from "./schema";

export const PREFERENCES_FILE = "preferences.yaml";
export const CV_FILE = "cv.md";

export type ProfileLoadResult =
  | { ok: true; profile: Profile; cvHash: string; preferencesHash: string }
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
  return {
    ok: true,
    profile: { preferences: prefs.value, cv, loadedAt: now },
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

/**
 * Updates individual preference values in place, keeping comments and layout.
 * `path` is a list of keys, e.g. ["rates", "min_hourly", "EUR"].
 */
export function setPreferenceValues(
  text: string,
  updates: { path: (string | number)[]; value: unknown }[],
): { ok: true; text: string } | { ok: false; errors: string[] } {
  const doc = parseDocument(text);
  for (const u of updates) doc.setIn(u.path, u.value);
  const next = doc.toString();
  const parsed = parsePreferences(next);
  return parsed.ok ? { ok: true, text: next } : parsed;
}
