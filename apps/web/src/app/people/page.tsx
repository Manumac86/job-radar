import { listPeopleWithOffers } from "@job-radar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { PeopleTable, type PersonRow } from "./people-table";

export const metadata: Metadata = { title: "People" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Every person met in the search, with their offers (contacts spec, "People page"). */
export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp["q"] === "string" ? sp["q"].slice(0, 200) : "";
  const rows: PersonRow[] = listPeopleWithOffers(db(), q).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    companyName: p.companyName,
    linkedinUrl: p.linkedinUrl,
    email: p.email,
    phone: p.phone,
    other: p.other,
    note: p.note,
    offers: p.offers,
  }));
  const count = rows.length;
  return (
    <>
      <PageHeader
        title="People"
        description={
          q
            ? `${count} ${count === 1 ? "person matches" : "people match"} “${q}”.`
            : `${count} ${count === 1 ? "person" : "people"}. Kept only on this computer.`
        }
      />
      <PeopleTable rows={rows} />
    </>
  );
}
