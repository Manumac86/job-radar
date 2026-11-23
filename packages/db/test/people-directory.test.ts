import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/client";
import { migrationsDir } from "../src/paths";
import {
  addPersonToOffer,
  createPerson,
  deletePerson,
  DuplicatePersonError,
  findDuplicatePerson,
  getPerson,
  linkPersonToOffer,
  listPeopleWithOffers,
  mergePeople,
  offerTimeline,
  peopleForOffer,
  peopleKnownForOffer,
  searchPeople,
  updatePerson,
  upsertCompany,
  type PersonFields,
} from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("migration 0010_people_company_optional", () => {
  it("keeps people and their offer links, and allows a person without a company", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-db-"));
    dirs.push(dir);
    const old = join(dir, "migrations");
    cpSync(migrationsDir(), old, { recursive: true });
    const journalFile = join(old, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8")) as { entries: { tag: string }[] };
    const cut = journal.entries.findIndex((e) => e.tag.startsWith("0010_"));
    writeFileSync(
      journalFile,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut) }),
    );
    const path = join(dir, "radar.sqlite");
    const first = openDatabase({ path, migrate: false });
    migrate(first, { migrationsFolder: old });
    const run = (sql: string) => first.$client.prepare(sql).run();
    run("insert into sources (id, type, name, enabled) values ('ashby', 'ashby', 'a', 1)");
    run("insert into companies (name, normalized_name) values ('Contoso', 'contoso')");
    run(
      "insert into offers (source_id, external_id, source_url, title, normalized_title, company_id, company_name) values ('ashby', '1', 'https://x.invalid', 'AI Engineer', 'ai engineer', 1, 'Contoso')",
    );
    run("insert into people (company_id, name, role) values (1, 'Jane Roe', 'Recruiter')");
    run("insert into offer_people (offer_id, person_id) values (1, 1)");
    closeDatabase(first);

    const db = openDatabase({ path });
    const q = (sql: string) => db.$client.prepare(sql).all();
    expect(q("select id, company_id, name, role from people")).toEqual([
      { id: 1, company_id: 1, name: "Jane Roe", role: "Recruiter" },
    ]);
    expect(q("select offer_id, person_id from offer_people")).toEqual([
      { offer_id: 1, person_id: 1 },
    ]);
    db.$client.prepare("insert into people (name) values ('Sam Lee')").run();
    expect(q("pragma foreign_keys")).toEqual([{ foreign_keys: 1 }]);
    closeDatabase(db);
  });
});

const person = (o: Partial<PersonFields> = {}): PersonFields => ({
  name: "Jane Roe",
  role: "Recruiter",
  linkedinUrl: null,
  email: null,
  phone: null,
  other: null,
  note: null,
  ...o,
});

function setup() {
  const db = memoryDb();
  seedSource(db);
  const contoso = upsertCompany(db, { name: "Contoso", normalizedName: "contoso" });
  const fabrikam = upsertCompany(db, { name: "Fabrikam", normalizedName: "fabrikam" });
  const a = seedOffer(db, { companyId: contoso.id, companyName: "Contoso" });
  const a2 = seedOffer(db, { companyId: contoso.id, companyName: "Contoso", title: "Staff" });
  const b = seedOffer(db, { companyId: fabrikam.id, companyName: "Fabrikam" });
  return { db, a, a2, b };
}

describe("people directory (people-directory)", () => {
  it("an agency recruiter keeps their company and is linked to offers of two companies", () => {
    const { db, a, b } = setup();
    const jane = createPerson(db, person({ company: "Northwind Talent" }));
    expect(jane.companyName).toBe("Northwind Talent");
    linkPersonToOffer(db, a.id, jane.id);
    linkPersonToOffer(db, b.id, jane.id);
    expect(peopleForOffer(db, b.id).map((p) => p.companyName)).toEqual(["Northwind Talent"]);
    expect(getPerson(db, jane.id)?.companyName).toBe("Northwind Talent");
  });

  it("a person added from an offer defaults to its company; known at = works there or on its offers", () => {
    const { db, a, a2, b } = setup();
    const fromOffer = addPersonToOffer(db, a.id, person({ name: "Ann Lee" }));
    expect(fromOffer.companyName).toBe("Contoso");
    const none = addPersonToOffer(db, b.id, person({ name: "Bo Ray", company: "" }));
    expect(none.companyName).toBeNull();
    const agency = createPerson(db, person({ name: "Cy Fox", company: "Northwind Talent" }));
    linkPersonToOffer(db, a.id, agency.id);
    expect(peopleKnownForOffer(db, a2.id).map((p) => p.name)).toEqual(["Ann Lee", "Cy Fox"]);
    expect(peopleKnownForOffer(db, b.id)).toEqual([]);
  });

  it("refuses a duplicate LinkedIn profile or email, naming the existing person", () => {
    const { db, a } = setup();
    const jane = createPerson(
      db,
      person({ linkedinUrl: "https://www.linkedin.com/in/jane-roe", email: "jane@x.example" }),
    );
    const err = (() => {
      try {
        addPersonToOffer(
          db,
          a.id,
          person({ name: "J. Roe", linkedinUrl: "https://es.linkedin.com/in/Jane-Roe/" }),
        );
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DuplicatePersonError);
    expect((err as DuplicatePersonError).existing.id).toBe(jane.id);
    expect((err as DuplicatePersonError).message).toBe(
      "Jane Roe already has this LinkedIn profile",
    );
    expect(() => createPerson(db, person({ name: "Other", email: " JANE@x.example " }))).toThrow(
      "Jane Roe already has this email",
    );
    // Saving the same person with their own identity is fine.
    expect(
      updatePerson(
        db,
        jane.id,
        person({ linkedinUrl: "https://linkedin.com/in/jane-roe", email: "jane@x.example" }),
      ).id,
    ).toBe(jane.id);
    expect(findDuplicatePerson(db, { linkedinUrl: null, email: null })).toBeNull();
    expect(peopleForOffer(db, a.id)).toEqual([]);
  });

  it("searches name, contacts and company; on an offer, its company first and linked ones left out", () => {
    const { db, a } = setup();
    const zed = addPersonToOffer(db, a.id, person({ name: "Zed Contoso-Insider" }));
    createPerson(db, person({ name: "Amy Agent", company: "Northwind Talent", other: "@amy" }));
    createPerson(db, person({ name: "Ben Hall", email: "ben@contoso.example" }));
    createPerson(db, person({ name: "Cleo 100%_ok" }));
    expect(searchPeople(db, "northwind").map((p) => p.name)).toEqual(["Amy Agent"]);
    expect(searchPeople(db, "@AMY").map((p) => p.name)).toEqual(["Amy Agent"]);
    expect(searchPeople(db, "contoso").map((p) => p.name)).toEqual([
      "Ben Hall",
      "Zed Contoso-Insider",
    ]);
    expect(searchPeople(db, "contoso", { offerId: a.id }).map((p) => p.name)).toEqual(["Ben Hall"]);
    expect(searchPeople(db, "%_").map((p) => p.name)).toEqual(["Cleo 100%_ok"]);
    expect(searchPeople(db, "  ")).toEqual([]);
    expect(zed.companyName).toBe("Contoso");
  });

  it("lists people with their offers", () => {
    const { db, a, b } = setup();
    const jane = createPerson(db, person({ company: "Northwind Talent" }));
    linkPersonToOffer(db, a.id, jane.id);
    linkPersonToOffer(db, b.id, jane.id);
    createPerson(db, person({ name: "Sam Lee" }));
    const all = listPeopleWithOffers(db);
    expect(all.map((p) => [p.name, p.offers.map((o) => o.companyName)])).toEqual([
      ["Jane Roe", ["Contoso", "Fabrikam"]],
      ["Sam Lee", []],
    ]);
    expect(listPeopleWithOffers(db, "northwind").map((p) => p.name)).toEqual(["Jane Roe"]);
  });

  it("merges two people: links move, empty fields fill, notes join", () => {
    const { db, a, b } = setup();
    const keep = addPersonToOffer(
      db,
      a.id,
      person({ linkedinUrl: "https://www.linkedin.com/in/jane-roe", note: "Met at a meetup" }),
    );
    const dup = addPersonToOffer(
      db,
      b.id,
      person({ name: "Jane R.", role: null, email: "jane@x.example", note: "Prefers email" }),
    );
    linkPersonToOffer(db, a.id, dup.id);
    const merged = mergePeople(db, keep.id, dup.id);
    expect(merged).toMatchObject({
      name: "Jane Roe",
      role: "Recruiter",
      linkedinUrl: "https://www.linkedin.com/in/jane-roe",
      email: "jane@x.example",
      note: "Met at a meetup\n\nPrefers email",
    });
    expect(getPerson(db, dup.id)).toBeUndefined();
    expect(peopleForOffer(db, a.id).map((p) => p.id)).toEqual([keep.id]);
    expect(peopleForOffer(db, b.id).map((p) => p.id)).toEqual([keep.id]);
    expect(() => mergePeople(db, keep.id, keep.id)).toThrow();
  });

  it("deletes a person from every offer and keeps the timeline", () => {
    const { db, a, b } = setup();
    const jane = addPersonToOffer(db, a.id, person());
    linkPersonToOffer(db, b.id, jane.id);
    deletePerson(db, jane.id);
    expect(peopleForOffer(db, a.id)).toEqual([]);
    expect(peopleForOffer(db, b.id)).toEqual([]);
    expect(offerTimeline(db, a.id).at(-1)?.message).toBe("Added Jane Roe (Recruiter)");
    expect(() => deletePerson(db, jane.id)).toThrow("Person not found");
  });
});
