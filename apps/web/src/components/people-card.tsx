"use client";

// People on an offer (contacts spec; offer-notes-and-people D4; people-directory D2–D4). The
// search links anyone already known; a duplicate LinkedIn or email offers the existing person.
import { Pencil, UserMinus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addPerson,
  editPerson,
  linkPerson,
  loadOfferPeople,
  unlinkPerson,
  type OfferPeople,
  type PeopleResult,
  type PersonView,
} from "@/app/offers/[id]/people-actions";
import { PersonContacts, roleLine } from "@/components/people/person-contacts";
import { draftOf, PersonDialog, type PersonDraft } from "@/components/people/person-dialog";
import { PersonSearch } from "@/components/people/person-search";
import { Button } from "@/components/ui/button";

type Editing = { person: PersonView | null; initial: PersonDraft };

function PersonRow({
  person,
  offerCompany,
  onEdit,
  onRemove,
  pending,
}: {
  person: PersonView;
  offerCompany: string;
  onEdit: () => void;
  onRemove: () => void;
  pending: boolean;
}) {
  // The company is shown when it is not the offer's (an agency recruiter, for example).
  const line = person.companyName === offerCompany ? (person.role ?? "") : roleLine(person);
  return (
    <li className="space-y-1 rounded-md border p-3 text-sm" data-testid="person">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium [overflow-wrap:anywhere]">{person.name}</div>
          {line ? <div className="text-muted-foreground">{line}</div> : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Edit ${person.name}`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Remove ${person.name} from this offer`}
            disabled={pending}
            onClick={onRemove}
          >
            <UserMinus className="size-3.5" />
          </Button>
        </div>
      </div>
      <PersonContacts person={person} />
      {person.note ? (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{person.note}</p>
      ) : null}
    </li>
  );
}

/** People on an offer; loads them itself when `initial` is not given (the pipeline drawer). */
export function PeopleCard({
  offerId,
  companyName,
  initial,
  onChange,
}: {
  offerId: number;
  companyName: string;
  initial?: OfferPeople;
  onChange?: () => void;
}) {
  const [data, setData] = useState<OfferPeople | null>(initial ?? null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<PersonView | null>(null);
  const [pending, start] = useTransition();

  // New server data after a revalidation replaces the local copy.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    if (initial) setData(initial);
  }
  useEffect(() => {
    if (initial) return;
    let live = true;
    void loadOfferPeople(offerId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [offerId, initial]);

  const open = (e: Editing) => {
    setErrors({});
    setDuplicate(null);
    setEditing(e);
  };
  const run = (fn: () => Promise<PeopleResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setDuplicate(r.duplicate ?? null);
        toast.error(r.error);
        return;
      }
      setErrors({});
      setDuplicate(null);
      setData(r.people);
      toast.success(r.message);
      after?.();
      onChange?.();
    });

  const people = data?.people ?? [];
  const known = data?.known ?? [];
  return (
    <div className="space-y-3" data-testid="people">
      {people.length ? (
        <ul className="space-y-2">
          {people.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              offerCompany={companyName}
              pending={pending}
              onEdit={() => open({ person: p, initial: draftOf(p) })}
              onRemove={() => run(() => unlinkPerson(offerId, p.id))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{data ? "No people yet." : "Loading…"}</p>
      )}
      <PersonSearch
        offerId={offerId}
        onPick={(p) => run(() => linkPerson(offerId, p.id))}
        onCreate={(name) =>
          open({ person: null, initial: draftOf(null, { name, company: companyName }) })
        }
      />
      {known.length ? (
        <div className="space-y-1" data-testid="people-known">
          <div className="text-xs font-medium text-muted-foreground">Known at {companyName}</div>
          <ul className="space-y-1">
            {known.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {p.name}
                  {p.role ? <span className="text-muted-foreground"> · {p.role}</span> : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => linkPerson(offerId, p.id))}
                >
                  Add to this offer
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {editing ? (
        <PersonDialog
          key={editing.person?.id ?? "new"}
          person={editing.person}
          initial={editing.initial}
          pending={pending}
          errors={errors}
          duplicate={duplicate}
          useDuplicateLabel={editing.person ? "Open" : "Use"}
          onUseDuplicate={
            editing.person
              ? undefined
              : (p) =>
                  run(
                    () => linkPerson(offerId, p.id),
                    () => setEditing(null),
                  )
          }
          onClose={() => setEditing(null)}
          onSave={(d) =>
            run(
              () =>
                editing.person ? editPerson(offerId, editing.person.id, d) : addPerson(offerId, d),
              () => setEditing(null),
            )
          }
        />
      ) : null}
    </div>
  );
}
