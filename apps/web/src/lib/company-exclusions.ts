import "server-only";
import { excludedCompany, excludedCompanyReason } from "@job-radar/core/offers";
import { readProfileFiles, setPreferenceValues } from "@job-radar/core/profile";
import { applyCompanyExclusions } from "@job-radar/db";
import { db } from "@/lib/db";
import { profileDir, readPreferences } from "@/lib/profile";

/** Trims, drops blanks and case-insensitive duplicates, keeping the first spelling. */
export function cleanCompanyList(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name.slice(0, 120));
  }
  return out;
}

export function currentExcludedCompanies(): string[] {
  return readPreferences().prefs?.keywords.exclude_companies ?? [];
}

/** New preferences.yaml text with this list, or the validation errors. */
export function preferencesWithCompanies(list: string[]) {
  const { preferences } = readProfileFiles(profileDir());
  return setPreferenceValues(preferences, [
    { path: ["keywords", "exclude_companies"], value: list },
  ]);
}

/** Hides stored offers of excluded companies and restores the ones no longer excluded. */
export function applyExclusionsNow(list: string[]) {
  return applyCompanyExclusions(db(), (name) => excludedCompany(name, list), excludedCompanyReason);
}
