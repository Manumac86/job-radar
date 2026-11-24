import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPreferenceChanges,
  deleteVariant,
  ensureProfileFiles,
  loadVariants,
  MAX_VARIANT_CHARS,
  MAX_VARIANTS,
  renameVariant,
  saveVariant,
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

describe("applyPreferenceChanges", () => {
  const changedLines = (a: string, b: string) => {
    const x = a.split("\n");
    return b.split("\n").filter((line, i) => x[i] !== line);
  };

  it("changes one value and leaves every other line byte-identical", () => {
    const r = applyPreferenceChanges(seedPrefs, [
      { path: ["engagement", "weekly_capacity_hours"], value: 30 },
    ]);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.text.split("\n")).toHaveLength(seedPrefs.split("\n").length);
    expect(changedLines(seedPrefs, r.text)).toEqual(["  weekly_capacity_hours: 30"]);
    expect(r.value.engagement.weekly_capacity_hours).toBe(30);
  });

  it("replaces lists keeping flow style and the comments around them", () => {
    const r = applyPreferenceChanges(seedPrefs, [
      { path: ["skills"], value: ["TypeScript", "Rust"] },
      { path: ["target_roles"], value: ["Staff AI Engineer", "Tech Lead"] },
      {
        path: ["service_lines"],
        value: [{ id: "llm-features", name: "LLM features", evidence: "Northwind assistant" }],
      },
    ]);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.text).toContain("skills: [TypeScript, Rust]\n");
    expect(r.text).toContain("  - Staff AI Engineer\n  - Tech Lead\n");
    expect(r.text).toContain("# used to label matches and tailor drafts");
    expect(r.text).toContain("# Job Radar — example preferences");
    expect(r.value.service_lines).toHaveLength(1);
  });

  it("deletes optional keys and keeps the file valid", () => {
    const r = applyPreferenceChanges(seedPrefs, [
      { path: ["rates", "target_hourly"], delete: true },
    ]);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.text).not.toContain("target_hourly");
    expect(r.value.rates.target_hourly).toBeUndefined();
  });

  it("returns path-keyed errors for invalid changes", () => {
    const r = applyPreferenceChanges(seedPrefs, [
      { path: ["scoring", "thresholds", "possible"], value: 90 },
      { path: ["scoring", "thresholds", "strong"], value: 80 },
      { path: ["skills"], value: [] },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual(
      expect.arrayContaining([
        { path: "scoring.thresholds", message: "possible must be lower than strong" },
        expect.objectContaining({ path: "skills" }),
      ]),
    );
  });

  it("leaves the sources block untouched", () => {
    const block = seedPrefs.slice(seedPrefs.indexOf("sources:"), seedPrefs.indexOf("scoring:"));
    expect(block).toContain("ycombinator:");
    const r = applyPreferenceChanges(seedPrefs, [{ path: ["skills"], value: ["Go"] }]);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.text).toContain(block);
  });

  it("adds missing keys under their parent, block and flow", () => {
    const r = applyPreferenceChanges(seedPrefs, [
      { path: ["rates", "min_hourly", "CHF"], value: 90 },
      { path: ["keywords", "title_include"], value: ["Engineer"] },
      { path: ["notifications", "digest_time"], value: "09:00" },
    ]);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.value.rates.min_hourly["CHF"]).toBe(90);
    expect(r.value.keywords.title_include).toEqual(["Engineer"]);
    expect(r.value.notifications.digest_time).toBe("09:00");
    expect(r.text).toContain("# Job Radar — example preferences");
  });

  it("an empty required list is refused with its path", () => {
    const r = applyPreferenceChanges(seedPrefs, [{ path: ["target_roles"], value: [] }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[0]?.path).toBe("target_roles");
  });

  it("reports YAML syntax errors without a field", () => {
    const r = applyPreferenceChanges("owner:\n  name: [x\n", []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[0]?.path).toBe("");
  });
});

describe("CV variants", () => {
  const variant = (name: string, useFor: string, text: string) =>
    `---\nname: ${name}\nuse_for: ${useFor}\n---\n\n${text}\n`;
  const write = (file: string, raw: string) => {
    mkdirSync(join(dir, "cvs"), { recursive: true });
    writeFileSync(join(dir, "cvs", file), raw);
  };

  it("loads valid variants and skips invalid ones without invalidating the profile", () => {
    ensureProfileFiles(dir, seedDir);
    write("tech-lead.md", variant("Tech Lead", "Lead and EM roles", "Led a team of 6."));
    write("ai-engineer.md", variant("AI Engineer", "LLM roles", "Built a RAG assistant."));
    write("no-name.md", "---\nuse_for: x\n---\nText\n");
    write("empty.md", variant("Empty", "x", ""));
    write("huge.md", variant("Huge", "x", "a".repeat(MAX_VARIANT_CHARS + 1)));
    const r = loadProfile(dir);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.profile.variants?.map((v) => v.id)).toEqual(["ai-engineer", "tech-lead"]);
    expect(r.profile.variants?.[1]).toMatchObject({
      name: "Tech Lead",
      useFor: "Lead and EM roles",
    });
    expect(r.variantErrors).toEqual([
      "cvs/empty.md: the CV text is empty",
      `cvs/huge.md: longer than ${MAX_VARIANT_CHARS} characters`,
      "cvs/no-name.md: name is missing",
    ]);
    expect(r.variantsHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("has no variants without a cvs folder, and never seeds variants", () => {
    ensureProfileFiles(dir, seedDir);
    const r = loadProfile(dir);
    expect(r.ok && r.profile.variants).toEqual([]);
    expect(r.ok && r.variantsHash).toBe("");
    expect(existsSync(join(dir, "cvs"))).toBe(false);
  });

  it("refuses a ninth variant and keeps the first eight", () => {
    ensureProfileFiles(dir, seedDir);
    for (let i = 1; i <= MAX_VARIANTS; i++)
      expect(saveVariant(dir, { name: `Variant ${i}`, useFor: "x", text: "CV" }).ok).toBe(true);
    expect(saveVariant(dir, { name: "Ninth", useFor: "x", text: "CV" })).toEqual({
      ok: false,
      errors: [`At most ${MAX_VARIANTS} CV variants`],
    });
    write("zz-extra.md", variant("Extra", "x", "CV"));
    const r = loadVariants(dir);
    expect(r.variants).toHaveLength(MAX_VARIANTS);
    expect(r.errors).toEqual([`cvs/zz-extra.md: ignored, at most ${MAX_VARIANTS} variants`]);
  });

  it("saves, renames (keeping the id) and deletes, and the hash follows changes", () => {
    const created = saveVariant(dir, { name: "Tech Lead", useFor: "EM roles", text: "Led 6." });
    expect(created).toEqual({ ok: true, id: "tech-lead" });
    const h1 = loadVariants(dir).hash;
    expect(renameVariant(dir, "tech-lead", "Engineering Lead")).toEqual({
      ok: true,
      id: "tech-lead",
    });
    expect(loadVariants(dir).variants[0]?.name).toBe("Engineering Lead");
    expect(loadVariants(dir).hash).not.toBe(h1);
    expect(saveVariant(dir, { name: "Tech Lead", useFor: "x", text: "y" })).toEqual({
      ok: true,
      id: "tech-lead-2",
    });
    expect(saveVariant(dir, { name: "", useFor: "x", text: "y" }).ok).toBe(false);
    expect(deleteVariant(dir, "tech-lead")).toBe(true);
    expect(deleteVariant(dir, "../cv")).toBe(false);
    expect(loadVariants(dir).variants.map((v) => v.id)).toEqual(["tech-lead-2"]);
  });
});

describe("notifications.link_base_url (notifications spec, Links in messages)", () => {
  const withLink = (url: string) =>
    seedPrefs.replace(
      "follow_up_days: [7]",
      `follow_up_days: [7]\n  link_base_url: ${JSON.stringify(url)}`,
    );

  it("is unset in the example profile", () => {
    const r = parsePreferences(seedPrefs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.value.notifications.link_base_url).toBeUndefined();
  });

  it("keeps an http or https address, without its trailing slash", () => {
    for (const [given, kept] of [
      ["https://my-mac.tailnet-name.ts.net/", "https://my-mac.tailnet-name.ts.net"],
      ["http://127.0.0.1:3300", "http://127.0.0.1:3300"],
    ]) {
      const r = parsePreferences(withLink(given!));
      if (!r.ok) throw new Error(r.errors.join("\n"));
      expect(r.value.notifications.link_base_url).toBe(kept);
    }
  });

  it("refuses a path, a query or a fragment: links add their own path", () => {
    for (const bad of [
      "https://my-mac.tailnet-name.ts.net/offers",
      "https://my-mac.tailnet-name.ts.net/?a=1&b=2",
      'https://my-mac.tailnet-name.ts.net/"x',
      "https://my-mac.tailnet-name.ts.net/#top",
      "https://user:pw@my-mac.tailnet-name.ts.net",
    ]) {
      const r = parsePreferences(withLink(bad));
      expect(r.ok, bad).toBe(false);
      if (!r.ok)
        expect(r.errors).toContain(
          "notifications.link_base_url: must be only the address, such as https://my-mac.tailnet-name.ts.net, without a path",
        );
    }
    const port = parsePreferences(withLink("https://my-mac.tailnet-name.ts.net:8443/"));
    if (!port.ok) throw new Error(port.errors.join("\n"));
    expect(port.value.notifications.link_base_url).toBe("https://my-mac.tailnet-name.ts.net:8443");
  });

  it("refuses an address without http:// or https://", () => {
    for (const bad of ["my-mac", "ftp://my-mac.tailnet-name.ts.net", "https://"]) {
      const r = parsePreferences(withLink(bad));
      expect(r.ok, bad).toBe(false);
      if (!r.ok)
        expect(r.errors).toContain(
          "notifications.link_base_url: must be an address starting with http:// or https://",
        );
    }
  });
});
