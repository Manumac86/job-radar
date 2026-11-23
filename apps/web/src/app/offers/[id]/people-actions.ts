"use server";

// Notes and people (offer-notes-and-people D1, D4; people-directory D3–D7). Contact details stay
// in the local database: they are never logged and never sent to the worker or the LLM.
import { noteSchema, personInputSchema, type PersonInput } from "@job-radar/core/people";
import {
  addNote,
  addPersonToOffer,
  createPerson,
  deletePerson,
  DuplicatePersonError,
  getOffer,
  linkPersonToOffer,
  mergePeople,
  PeopleError,
  peopleForOffer,
  peopleKnownForOffer,
  searchPeople,
  unlinkPersonFromOffer,
  updatePerson,
  type PersonWithCompany,
} from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export interface PersonView {
  id: number;
  name: string;
  role: string | null;
  companyName: string | null;
  linkedinUrl: string | null;
  email: string | null;
  phone: string | null;
  other: string | null;
  note: string | null;
}

export interface OfferPeople {
  people: PersonView[];
  known: PersonView[];
}

export type PeopleResult =
  | { ok: true; message: string; people: OfferPeople; person?: PersonView }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      /** The person who already has this LinkedIn profile or email (people-directory D4). */
      duplicate?: PersonView;
    };

export type SimpleResult = { ok: true; message: string } | { ok: false; error: string };

export type PersonSaveInput = PersonInput;

export async function toPersonView(p: PersonWithCompany): Promise<PersonView> {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    companyName: p.companyName,
    linkedinUrl: p.linkedinUrl,
    email: p.email,
    phone: p.phone,
    other: p.other,
    note: p.note,
  };
}

const views = (rows: PersonWithCompany[]) => Promise.all(rows.map(toPersonView));
const validOffer = (offerId: number | null | undefined): offerId is number =>
  typeof offerId === "number" && Number.isInteger(offerId) && !!getOffer(db(), offerId);

/** The people on an offer and the others known at its company. */
export async function loadOfferPeople(offerId: number): Promise<OfferPeople> {
  if (!validOffer(offerId)) return { people: [], known: [] };
  return {
    people: await views(peopleForOffer(db(), offerId)),
    known: await views(peopleKnownForOffer(db(), offerId)),
  };
}

/** "Add person" search (people-directory D3); with an offer, its people are left out. */
export async function findPeople(query: string, offerId?: number): Promise<PersonView[]> {
  if (typeof query !== "string" || query.length > 200) return [];
  return views(searchPeople(db(), query, validOffer(offerId) ? { offerId } : {}));
}

function refresh(offerId?: number | null) {
  if (offerId) revalidatePath(`/offers/${offerId}`);
  revalidatePath("/pipeline");
  revalidatePath("/people");
}

async function failure(err: unknown): Promise<PeopleResult> {
  if (err instanceof DuplicatePersonError)
    return {
      ok: false,
      error: err.message,
      fieldErrors: { [err.field]: err.message },
      duplicate: await toPersonView(err.existing),
    };
  if (err instanceof PeopleError) return { ok: false, error: err.message };
  throw err;
}

/** Runs a change and returns the offer's people afterwards (or none, off an offer). */
async function mutate(
  offerId: number | null,
  message: string,
  fn: () => PersonWithCompany | undefined,
): Promise<PeopleResult> {
  if (offerId !== null && !validOffer(offerId)) return { ok: false, error: "Offer not found" };
  let person: PersonWithCompany | undefined;
  try {
    person = fn();
  } catch (err) {
    return failure(err);
  }
  refresh(offerId);
  return {
    ok: true,
    message,
    people: offerId === null ? { people: [], known: [] } : await loadOfferPeople(offerId),
    ...(person ? { person: await toPersonView(person) } : {}),
  };
}

function parsePerson(input: PersonSaveInput) {
  const parsed = personInputSchema.safeParse(input);
  if (parsed.success) return { fields: parsed.data } as const;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "name");
    fieldErrors[key] ??= issue.message;
  }
  return { error: { ok: false, error: "Check the highlighted fields", fieldErrors } as const };
}

/** Creates a person on an offer, or on its own from the People page (`offerId` null). */
export async function addPerson(
  offerId: number | null,
  input: PersonSaveInput,
): Promise<PeopleResult> {
  const p = parsePerson(input);
  if (p.error) return p.error;
  return mutate(offerId, `Added ${p.fields.name}`, () =>
    offerId === null ? createPerson(db(), p.fields) : addPersonToOffer(db(), offerId, p.fields),
  );
}

export async function editPerson(
  offerId: number | null,
  personId: number,
  input: PersonSaveInput,
): Promise<PeopleResult> {
  const p = parsePerson(input);
  if (p.error) return p.error;
  return mutate(offerId, "Saved", () => updatePerson(db(), personId, p.fields));
}

export async function linkPerson(offerId: number, personId: number): Promise<PeopleResult> {
  return mutate(offerId, "Added to this offer", () => linkPersonToOffer(db(), offerId, personId));
}

export async function unlinkPerson(offerId: number, personId: number): Promise<PeopleResult> {
  return mutate(offerId, "Removed from this offer", () => {
    unlinkPersonFromOffer(db(), offerId, personId);
    return undefined;
  });
}

/** Merge `removeId` into `keepId` (people-directory D5). */
export async function mergePerson(keepId: number, removeId: number): Promise<PeopleResult> {
  return mutate(null, "Merged", () => mergePeople(db(), keepId, removeId));
}

/** Delete a person (people-directory D6); offers' timelines keep their entries. */
export async function removePerson(personId: number): Promise<PeopleResult> {
  return mutate(null, "Deleted", () => {
    deletePerson(db(), personId);
    return undefined;
  });
}

export async function addOfferNote(offerId: number, text: string): Promise<SimpleResult> {
  const note = noteSchema.safeParse(text);
  if (!note.success) return { ok: false, error: note.error.issues[0]?.message ?? "Invalid note" };
  if (!validOffer(offerId)) return { ok: false, error: "Offer not found" };
  addNote(db(), offerId, note.data);
  refresh(offerId);
  return { ok: true, message: "Note added" };
}
