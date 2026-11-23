// People (contacts spec; offer-notes-and-people D2, D5; people-directory D1–D6). A person may
// work at a company (optional) and be linked to offers of any company. Links are recorded in the
// timeline with the name and role only, never contact details.
import {
  emailKey,
  isIdLikeCompany,
  linkedInKey,
  normalizeCompany,
  UNKNOWN_COMPANY,
} from "@job-radar/core";
import { and, asc, eq, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { applications, companies, offerPeople, offers, people } from "../schema";
import { upsertCompany } from "./offers";
import { addTimelineEvent } from "./timeline";

export type Person = typeof people.$inferSelect;

/** A person with their company's name, as shown everywhere. */
export type PersonWithCompany = Person & { companyName: string | null };

export interface PersonFields {
  name: string;
  role: string | null;
  /** Company name; resolved to a company row (people-directory D1). Empty means none. */
  company?: string | null;
  linkedinUrl: string | null;
  email: string | null;
  phone: string | null;
  other: string | null;
  note: string | null;
}

export class PeopleError extends Error {
  override readonly name: string = "PeopleError";
}

/** The LinkedIn profile or email already belongs to `existing` (people-directory D4). */
export class DuplicatePersonError extends PeopleError {
  override readonly name = "DuplicatePersonError";
  constructor(
    readonly existing: PersonWithCompany,
    readonly field: "linkedinUrl" | "email",
  ) {
    super(
      `${existing.name} already has this ${field === "linkedinUrl" ? "LinkedIn profile" : "email"}`,
    );
  }
}

const label = (p: Pick<Person, "name" | "role">) => (p.role ? `${p.name} (${p.role})` : p.name);

const withCompany = {
  person: people,
  companyName: companies.name,
};
const flatten = (r: { person: Person; companyName: string | null }): PersonWithCompany => ({
  ...r.person,
  companyName: r.companyName,
});

function offerRow(db: Db, offerId: number) {
  const offer = db
    .select({ id: offers.id, companyId: offers.companyId, companyName: offers.companyName })
    .from(offers)
    .where(eq(offers.id, offerId))
    .get();
  if (!offer) throw new PeopleError("Offer not found");
  return offer;
}

function applicationIdOf(db: Pick<Db, "select">, offerId: number): number | null {
  return (
    db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.offerId, offerId))
      .get()?.id ?? null
  );
}

export function getPerson(db: Db, personId: number): PersonWithCompany | undefined {
  const r = db
    .select(withCompany)
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(eq(people.id, personId))
    .get();
  return r ? flatten(r) : undefined;
}

function companyIdFor(db: Db, name: string | null | undefined): number | null {
  const n = name?.trim();
  if (!n) return null;
  const normalizedName = normalizeCompany(n);
  if (!normalizedName) return null;
  return upsertCompany(db, { name: n, normalizedName }).id;
}

/** The person (other than `exceptId`) whose LinkedIn profile or email matches (D4). */
export function findDuplicatePerson(
  db: Db,
  fields: Pick<PersonFields, "linkedinUrl" | "email">,
  exceptId?: number,
): { person: PersonWithCompany; field: "linkedinUrl" | "email" } | null {
  const li = linkedInKey(fields.linkedinUrl);
  const em = emailKey(fields.email);
  if (!li && !em) return null;
  const rows = db
    .select(withCompany)
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(
      and(
        or(isNotNull(people.linkedinUrl), isNotNull(people.email)),
        exceptId === undefined ? undefined : ne(people.id, exceptId),
      ),
    )
    .orderBy(asc(people.id))
    .all();
  for (const r of rows) {
    if (li && linkedInKey(r.person.linkedinUrl) === li)
      return { person: flatten(r), field: "linkedinUrl" };
    if (em && emailKey(r.person.email) === em) return { person: flatten(r), field: "email" };
  }
  return null;
}

function assertNoDuplicate(db: Db, fields: PersonFields, exceptId?: number) {
  const dup = findDuplicatePerson(db, fields, exceptId);
  if (dup) throw new DuplicatePersonError(dup.person, dup.field);
}

function columns(db: Db, fields: PersonFields) {
  const { company, ...rest } = fields;
  return { ...rest, companyId: companyIdFor(db, company) };
}

/** Creates a person (from the People page or an offer). Refuses duplicates (D4). */
export function createPerson(db: Db, fields: PersonFields): PersonWithCompany {
  assertNoDuplicate(db, fields);
  const person = db.insert(people).values(columns(db, fields)).returning().get();
  return getPerson(db, person.id) ?? { ...person, companyName: null };
}

function link(db: Db, offerId: number, person: Person): boolean {
  return db.transaction((tx) => {
    const added = tx
      .insert(offerPeople)
      .values({ offerId, personId: person.id })
      .onConflictDoNothing()
      .run().changes;
    if (added)
      addTimelineEvent(tx, {
        offerId,
        applicationId: applicationIdOf(tx, offerId),
        kind: "person_added",
        message: `Added ${label(person)}`,
        data: { personId: person.id },
      });
    return added > 0;
  });
}

/**
 * Creates a person and links them to the offer. The company defaults to the offer's when the
 * field is absent (`company: undefined`); an empty string means no company (D1).
 */
export function addPersonToOffer(db: Db, offerId: number, fields: PersonFields): PersonWithCompany {
  const offer = offerRow(db, offerId);
  const known = offer.companyName !== UNKNOWN_COMPANY && !isIdLikeCompany(offer.companyName);
  const company =
    fields.company === undefined ? (known ? offer.companyName : null) : fields.company;
  return db.transaction(() => {
    const person = createPerson(db, { ...fields, company });
    link(db, offerId, person);
    return person;
  });
}

/** Links any existing person to the offer (D2). Linking twice is a no-op. */
export function linkPersonToOffer(db: Db, offerId: number, personId: number): PersonWithCompany {
  offerRow(db, offerId);
  const person = getPerson(db, personId);
  if (!person) throw new PeopleError("Person not found");
  link(db, offerId, person);
  return person;
}

/** Removes the link only: the person stays in the owner's people. */
export function unlinkPersonFromOffer(db: Db, offerId: number, personId: number): void {
  const person = db.select().from(people).where(eq(people.id, personId)).get();
  if (!person) throw new PeopleError("Person not found");
  db.transaction((tx) => {
    const removed = tx
      .delete(offerPeople)
      .where(and(eq(offerPeople.offerId, offerId), eq(offerPeople.personId, personId)))
      .run().changes;
    if (removed)
      addTimelineEvent(tx, {
        offerId,
        applicationId: applicationIdOf(tx, offerId),
        kind: "person_removed",
        message: `Removed ${person.name}`,
        data: { personId },
      });
  });
}

/** Editing is not a timeline event (offer-notes-and-people D5). Refuses duplicates (D4). */
export function updatePerson(db: Db, personId: number, fields: PersonFields): PersonWithCompany {
  if (!db.select({ id: people.id }).from(people).where(eq(people.id, personId)).get())
    throw new PeopleError("Person not found");
  assertNoDuplicate(db, fields, personId);
  const values = columns(db, fields);
  // An absent company keeps the current one.
  const { companyId, ...rest } = values;
  db.update(people)
    .set({ ...rest, ...(fields.company === undefined ? {} : { companyId }), updatedAt: new Date() })
    .where(eq(people.id, personId))
    .run();
  const person = getPerson(db, personId);
  if (!person) throw new PeopleError("Person not found");
  return person;
}

export function peopleForOffer(db: Db, offerId: number): PersonWithCompany[] {
  return db
    .select(withCompany)
    .from(offerPeople)
    .innerJoin(people, eq(people.id, offerPeople.personId))
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(eq(offerPeople.offerId, offerId))
    .orderBy(asc(offerPeople.createdAt), asc(people.id))
    .all()
    .map(flatten);
}

/**
 * People who work at the offer's company or are linked to its other offers, not yet linked to
 * this offer (D2).
 */
export function peopleKnownForOffer(db: Db, offerId: number): PersonWithCompany[] {
  const offer = offerRow(db, offerId);
  if (offer.companyId === null) return [];
  const linked = peopleForOffer(db, offerId).map((p) => p.id);
  const viaOffers = db
    .select({ id: offerPeople.personId })
    .from(offerPeople)
    .innerJoin(offers, eq(offers.id, offerPeople.offerId))
    .where(eq(offers.companyId, offer.companyId));
  return db
    .select(withCompany)
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(
      and(
        or(eq(people.companyId, offer.companyId), inArray(people.id, viaOffers)),
        linked.length ? notInArray(people.id, linked) : undefined,
      ),
    )
    .orderBy(asc(people.name))
    .all()
    .map(flatten);
}

const likeAny = (q: string) => {
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const like = (col: unknown) => sql`lower(coalesce(${col}, '')) like ${pattern} escape '\\'`;
  return or(
    like(people.name),
    like(people.email),
    like(people.linkedinUrl),
    like(people.other),
    like(companies.name),
  );
};

/**
 * Search over name, email, LinkedIn, other contact and company (D3). With `offerId`, people
 * already on the offer are left out and those at its company come first.
 */
export function searchPeople(
  db: Db,
  query: string,
  opts: { offerId?: number; limit?: number } = {},
): PersonWithCompany[] {
  const q = query.trim();
  if (!q) return [];
  const offer = opts.offerId === undefined ? null : offerRow(db, opts.offerId);
  const linked = offer ? peopleForOffer(db, offer.id).map((p) => p.id) : [];
  const rows = db
    .select(withCompany)
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(and(likeAny(q), linked.length ? notInArray(people.id, linked) : undefined))
    .orderBy(
      ...(offer?.companyId
        ? [sql`case when ${people.companyId} = ${offer.companyId} then 0 else 1 end`]
        : []),
      asc(people.name),
    )
    .limit(opts.limit ?? 8)
    .all();
  return rows.map(flatten);
}

export interface PersonOffer {
  id: number;
  title: string;
  companyName: string;
}

/** Every person (optionally filtered), with the offers they are on (People page, D7). */
export function listPeopleWithOffers(
  db: Db,
  query = "",
): (PersonWithCompany & { offers: PersonOffer[] })[] {
  const q = query.trim();
  const rows = db
    .select(withCompany)
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(q ? likeAny(q) : undefined)
    .orderBy(asc(sql`lower(${people.name})`), asc(people.id))
    .all()
    .map(flatten);
  if (!rows.length) return [];
  const links = db
    .select({
      personId: offerPeople.personId,
      id: offers.id,
      title: offers.title,
      companyName: offers.companyName,
    })
    .from(offerPeople)
    .innerJoin(offers, eq(offers.id, offerPeople.offerId))
    .where(
      inArray(
        offerPeople.personId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(offerPeople.createdAt))
    .all();
  return rows.map((r) => ({
    ...r,
    offers: links
      .filter((l) => l.personId === r.id)
      .map(({ id, title, companyName }) => ({ id, title, companyName })),
  }));
}

const MERGE_FIELDS = ["role", "companyId", "linkedinUrl", "email", "phone", "other"] as const;

/**
 * Merges `removeId` into `keepId` (D5): links move, empty fields are filled, notes are joined,
 * and the removed person is deleted. No timeline entries are written.
 */
export function mergePeople(db: Db, keepId: number, removeId: number): PersonWithCompany {
  if (keepId === removeId) throw new PeopleError("Choose two different people");
  const keep = db.select().from(people).where(eq(people.id, keepId)).get();
  const remove = db.select().from(people).where(eq(people.id, removeId)).get();
  if (!keep || !remove) throw new PeopleError("Person not found");
  db.transaction((tx) => {
    const offerIds = tx
      .select({ offerId: offerPeople.offerId, createdAt: offerPeople.createdAt })
      .from(offerPeople)
      .where(eq(offerPeople.personId, removeId))
      .all();
    for (const o of offerIds)
      tx.insert(offerPeople)
        .values({ offerId: o.offerId, personId: keepId, createdAt: o.createdAt })
        .onConflictDoNothing()
        .run();
    const fill: Partial<Person> = {};
    for (const f of MERGE_FIELDS)
      if (keep[f] === null && remove[f] !== null) Object.assign(fill, { [f]: remove[f] });
    const note =
      keep.note && remove.note && keep.note !== remove.note
        ? `${keep.note}\n\n${remove.note}`
        : (keep.note ?? remove.note);
    tx.update(people)
      .set({ ...fill, note, updatedAt: new Date() })
      .where(eq(people.id, keepId))
      .run();
    tx.delete(people).where(eq(people.id, removeId)).run();
  });
  const merged = getPerson(db, keepId);
  if (!merged) throw new PeopleError("Person not found");
  return merged;
}

/** Deletes a person: they leave every offer; timeline entries stay as written (D6). */
export function deletePerson(db: Db, personId: number): void {
  const removed = db.delete(people).where(eq(people.id, personId)).run().changes;
  if (!removed) throw new PeopleError("Person not found");
}
