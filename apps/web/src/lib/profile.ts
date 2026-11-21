import "server-only";
import {
  MASTER_CV_ID,
  isExampleCv,
  loadProfile,
  loadVariants,
  type Preferences,
} from "@job-radar/core/profile";
import { dataDir } from "@job-radar/db";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function profileDir(): string {
  return join(dataDir(), "profile");
}

/** Current preferences, or null with the validation errors when the files are invalid. */
export function readPreferences(): { prefs: Preferences | null; errors: string[] } {
  const r = loadProfile(profileDir());
  return r.ok ? { prefs: r.profile.preferences, errors: [] } : { prefs: null, errors: r.errors };
}

/** True while the live CV is still the bundled example. */
export function usingExampleProfile(): boolean {
  try {
    return isExampleCv(readFileSync(join(profileDir(), "cv.md"), "utf8"));
  } catch {
    return false;
  }
}

/** Short hash of the preferences text, used to refuse saves over a file changed elsewhere. */
export function preferencesHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** The preferences the form edits: everything except the per-source settings. */
export type PreferenceValues = Omit<Preferences, "sources">;

export function withoutSources(p: Preferences): PreferenceValues {
  const { sources: _sources, ...rest } = p;
  return rest;
}

/** The CV choices for "CV sent": master first, then the variants; empty without variants. */
export function cvOptions(): { id: string; name: string }[] {
  const { variants } = loadVariants(profileDir());
  if (!variants.length) return [];
  return [
    { id: MASTER_CV_ID, name: "Master CV" },
    ...variants.map((v) => ({ id: v.id, name: v.name })),
  ];
}

/** Resolves a CV id ("master" or a variant) to what an application records, or null. */
export function cvSentFor(id: string): { id: string; name: string } | null {
  return cvOptions().find((o) => o.id === id) ?? null;
}

/** Display name of a CV variant id, falling back to the id when it was deleted. */
export function cvName(id: string | null | undefined): string | null {
  if (!id) return null;
  return cvOptions().find((o) => o.id === id)?.name ?? id;
}
