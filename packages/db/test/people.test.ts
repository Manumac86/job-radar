import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/client";
import { migrationsDir } from "../src/paths";
import {
  addNote,
  addPersonToOffer,
  applicationTimeline,
  createApplication,
  linkPersonToOffer,
  offerTimeline,
  peopleForOffer,
  peopleKnownForOffer,
  unlinkPersonFromOffer,
  updatePerson,
  upsertCompany,
  type PersonFields,
} from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const jane: PersonFields = {
  name: "Jane Roe",
  role: "Recruiter",
  linkedinUrl: "https://www.linkedin.com/in/jane-roe",
  email: "jane@contoso.example",
  phone: null,
  other: "@janeroe on Telegram",
  note: null,
};

function setup() {
  const db = memoryDb();
  seedSource(db);
  const a = seedOffer(db);
  const b = seedOffer(db, { title: "Staff AI Engineer", normalizedTitle: "staff ai engineer" });
  const other = upsertCompany(db, { name: "Fabrikam", normalizedName: "fabrikam" });
  const c = seedOffer(db, { companyId: other.id, companyName: "Fabrikam" });
  return { db, a, b, c };
}

describe("migration 0009_people", () => {
  it("upgrades a 0008 database with empty people tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-db-"));
    dirs.push(dir);
    const old = join(dir, "migrations");
    cpSync(migrationsDir(), old, { recursive: true });
    const journalFile = join(old, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8")) as { entries: { tag: string }[] };
    const cut = journal.entries.findIndex((e) => e.tag.startsWith("0009_"));
    writeFileSync(
      journalFile,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut) }),
    );
    const path = join(dir, "radar.sqlite");
    const first = openDatabase({ path, migrate: false });
    migrate(first, { migrationsFolder: old });
    closeDatabase(first);

    const db = openDatabase({ path });
    const count = (t: string) =>
      (db.$client.prepare(`select count(*) n from ${t}`).get() as { n: number }).n;
    expect(count("people")).toBe(0);
    expect(count("offer_people")).toBe(0);
    closeDatabase(db);
  });
});

describe("people on offers", () => {
  it("adds a person at the offer's company and records it without contact details", () => {
    const { db, a } = setup();
    const p = addPersonToOffer(db, a.id, jane);
    expect(p.companyId).toBe(a.companyId);
    expect(peopleForOffer(db, a.id).map((x) => x.name)).toEqual(["Jane Roe"]);
    const event = offerTimeline(db, a.id).at(-1);
    expect(event).toMatchObject({ kind: "person_added", message: "Added Jane Roe (Recruiter)" });
    expect(JSON.stringify(event)).not.toContain("jane@contoso.example");
    expect(JSON.stringify(event)).not.toContain("linkedin");
  });

  it("suggests people known at the company on its other offers, and links once", () => {
    const { db, a, b, c } = setup();
    const p = addPersonToOffer(db, a.id, jane);
    expect(peopleKnownForOffer(db, b.id).map((x) => x.id)).toEqual([p.id]);
    expect(peopleKnownForOffer(db, a.id)).toEqual([]);
    expect(peopleKnownForOffer(db, c.id)).toEqual([]);
    linkPersonToOffer(db, b.id, p.id);
    linkPersonToOffer(db, b.id, p.id);
    expect(peopleForOffer(db, b.id)).toHaveLength(1);
    expect(offerTimeline(db, b.id).filter((e) => e.kind === "person_added")).toHaveLength(1);
    // Any company: an agency recruiter (people-directory D2).
    linkPersonToOffer(db, c.id, p.id);
    expect(peopleForOffer(db, c.id).map((x) => x.name)).toEqual(["Jane Roe"]);
  });

  it("removes from one offer only, and edits without a timeline entry", () => {
    const { db, a, b } = setup();
    const p = addPersonToOffer(db, a.id, jane);
    linkPersonToOffer(db, b.id, p.id);
    unlinkPersonFromOffer(db, a.id, p.id);
    expect(peopleForOffer(db, a.id)).toEqual([]);
    expect(peopleForOffer(db, b.id)).toHaveLength(1);
    expect(peopleKnownForOffer(db, a.id).map((x) => x.id)).toEqual([p.id]);
    expect(offerTimeline(db, a.id).at(-1)?.message).toBe("Removed Jane Roe");
    const before = offerTimeline(db, b.id).length;
    expect(updatePerson(db, p.id, { ...jane, role: "Head of Talent" }).role).toBe("Head of Talent");
    expect(offerTimeline(db, b.id)).toHaveLength(before);
  });
});

describe("notes", () => {
  it("adds a note to an offer without an application, and to both timelines with one", () => {
    const { db, a, b } = setup();
    const n = addNote(db, a.id, "  Contacted on Telegram ");
    expect(n).toMatchObject({
      kind: "note",
      message: "Contacted on Telegram",
      applicationId: null,
    });
    const app = createApplication(db, { offerId: b.id, at: new Date() });
    addNote(db, b.id, "Referral possible");
    expect(offerTimeline(db, b.id).at(-1)?.message).toBe("Referral possible");
    expect(applicationTimeline(db, app.id).at(-1)?.message).toBe("Referral possible");
    expect(() => addNote(db, a.id, "   ")).toThrow();
  });
});
