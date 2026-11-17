import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureProfileFiles,
  loadProfile,
  parsePreferences,
  saveProfileFiles,
  setPreferenceValues,
} from "../src/index";

const seedDir = join(import.meta.dirname, "..", "..", "..", "profile-seed");
const seedPrefs = readFileSync(join(seedDir, "preferences.yaml"), "utf8");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-profile-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("profile", () => {
  it("loads the owner's seed profile", () => {
    expect(ensureProfileFiles(dir, seedDir).length).toBeGreaterThanOrEqual(2);
    const result = loadProfile(dir);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const p = result.profile.preferences;
    expect(p.owner.timezone).toBe("Europe/Lisbon");
    expect(p.rates.min_hourly["EUR"]).toBe(55);
    expect(p.skills).toContain("TypeScript");
    expect(p.scoring.thresholds).toEqual({ strong: 80, possible: 60 });
    expect(result.profile.cv).toContain("Alex Rivera");
    // Second call does not overwrite owner edits.
    expect(ensureProfileFiles(dir, seedDir)).toEqual([]);
  });

  it("reports invalid fields as readable, field-level errors", () => {
    const broken = seedPrefs
      .replace("EUR: 55", 'EUR: "sixty"')
      .replace("weekly_capacity_hours: 40", "weekly_capacity_hours: 400")
      .replace("timezone: Europe/Lisbon", "timezone: Mars/Olympus")
      .replace('digest_time: "08:30"', 'digest_time: "8.30"');
    const result = parsePreferences(broken + "\nunexpected_field: true\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^rates\.min_hourly\.EUR: expected number, received string$/),
        expect.stringMatching(/^engagement\.weekly_capacity_hours: Too big/),
        "owner.timezone: must be an IANA time zone like Europe/Lisbon",
        'notifications.digest_time: must be a 24-hour time like "08:30"',
        "(root): unknown field(s): unexpected_field",
      ]),
    );
  });

  it("reports YAML syntax errors with a line number", () => {
    const result = parsePreferences("owner:\n  name: [unclosed\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^preferences\.yaml line \d+: /);
  });

  it("reports missing files", () => {
    const result = loadProfile(dir);
    expect(result).toMatchObject({ ok: false, status: "missing" });
  });

  it("saves edits keeping comments, and refuses invalid ones", () => {
    ensureProfileFiles(dir, seedDir);
    const updated = setPreferenceValues(seedPrefs, [
      { path: ["rates", "min_hourly", "EUR"], value: 70 },
    ]);
    if (!updated.ok) throw new Error(updated.errors.join("\n"));
    expect(updated.text).toContain("# Job Radar — example preferences");
    expect(saveProfileFiles(dir, { preferences: updated.text })).toEqual({ ok: true });
    const reloaded = loadProfile(dir);
    expect(reloaded.ok && reloaded.profile.preferences.rates.min_hourly["EUR"]).toBe(70);

    const bad = saveProfileFiles(dir, { preferences: "owner: 1\n" });
    expect(bad.ok).toBe(false);
    expect(readFileSync(join(dir, "preferences.yaml"), "utf8")).toBe(updated.text);
    writeFileSync(join(dir, "cv.md"), "");
    expect(loadProfile(dir)).toMatchObject({ ok: false, status: "invalid" });
  });
});
