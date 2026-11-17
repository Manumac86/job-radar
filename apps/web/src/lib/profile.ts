import "server-only";
import { isExampleCv, loadProfile, type Preferences } from "@job-radar/core/profile";
import { dataDir } from "@job-radar/db";
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
