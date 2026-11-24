"use client";

// People page (people-directory D7): search, edit, merge and delete. Contacts open or copy only.
import { GitMerge, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addPerson,
  editPerson,
  mergePerson,
  removePerson,
  type PeopleResult,
  type PersonView,
} from "@/app/offers/[id]/people-actions";
import { PersonContacts, roleLine } from "@/components/people/person-contacts";
import { draftOf, PersonDialog, type PersonDraft } from "@/components/people/person-dialog";
import { PersonSearch } from "@/components/people/person-search";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PersonRow extends PersonView {
  offers: { id: number; title: string; companyName: string }[];
}

type Editing = { person: PersonView | null; initial: PersonDraft };

/** Edit, merge and delete; larger targets in the phone list (`touch`). */
function PersonActions({
  person,
  touch = false,
  onEdit,
  onMerge,
  onDelete,
}: {
  person: PersonRow;
  touch?: boolean;
  onEdit: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const size = touch ? "size-9" : "size-7";
  return (
    <div className="flex shrink-0 justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={size}
        aria-label={`Edit ${person.name}`}
        onClick={onEdit}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={size}
        aria-label={`Merge ${person.name}`}
        onClick={onMerge}
      >
        <GitMerge className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={size}
        aria-label={`Delete ${person.name}`}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function PersonOffers({ person }: { person: PersonRow }) {
  return person.offers.length ? (
    <ul className="space-y-0.5 text-sm" data-testid="person-offers">
      {person.offers.map((o) => (
        <li key={o.id}>
          <Link href={`/offers/${o.id}`} className="underline">
            {o.title}
          </Link>
          <span className="text-muted-foreground"> · {o.companyName}</span>
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-sm text-muted-foreground">No offers</span>
  );
}

function MergeDialog({
  person,
  pending,
  onMerge,
  onClose,
}: {
  person: PersonRow;
  pending: boolean;
  onMerge: (keepId: number, removeId: number) => void;
  onClose: () => void;
}) {
  const [other, setOther] = useState<PersonView | null>(null);
  const [keep, setKeep] = useState<"this" | "other">("this");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {person.name}</DialogTitle>
          <DialogDescription>
            Choose the duplicate. Its offers move to the person you keep, and empty fields are
            filled from it.
          </DialogDescription>
        </DialogHeader>
        {other ? (
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Keep</legend>
            {(
              [
                ["this", person],
                ["other", other],
              ] as const
            ).map(([value, p]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="keep"
                  value={value}
                  checked={keep === value}
                  onChange={() => setKeep(value)}
                />
                <span>
                  {p.name}
                  {roleLine(p) ? (
                    <span className="text-muted-foreground"> · {roleLine(p)}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <PersonSearch
            label="Choose the duplicate"
            allowCreate={false}
            exclude={[person.id]}
            onPick={setOther}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!other || pending}
            onClick={() =>
              other &&
              onMerge(
                keep === "this" ? person.id : other.id,
                keep === "this" ? other.id : person.id,
              )
            }
          >
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  person,
  pending,
  onDelete,
  onClose,
}: {
  person: PersonRow;
  pending: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const n = person.offers.length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {person.name}?</DialogTitle>
          <DialogDescription>
            {n
              ? `They leave ${n} ${n === 1 ? "offer" : "offers"}. The offers' timelines keep their entries.`
              : "They are not on any offer."}{" "}
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onDelete}>
            Delete person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PeopleTable({ rows }: { rows: PersonRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [merging, setMerging] = useState<PersonRow | null>(null);
  const [deleting, setDeleting] = useState<PersonRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<PersonView | null>(null);
  const [pending, start] = useTransition();

  // Debounced search in the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") === q) return;
      const next = new URLSearchParams(params.toString());
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
      toast.success(r.message);
      after?.();
      router.refresh();
    });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const actions = (p: PersonRow, touch = false) => (
    <PersonActions
      person={p}
      touch={touch}
      onEdit={() => open({ person: p, initial: draftOf(p) })}
      onMerge={() => setMerging(p)}
      onDelete={() => setDeleting(p)}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, LinkedIn or company"
          aria-label="Search people"
          className="w-full sm:w-80"
        />
        <Button variant="outline" onClick={() => open({ person: null, initial: draftOf(null) })}>
          <Plus className="size-3.5" /> Add person
        </Button>
      </div>
      {rows.length ? (
        <div className="rounded-md border">
          {/* Below md: one stacked entry per person, actions within reach (job-dashboard spec). */}
          <ol className="divide-y md:hidden" aria-label="People">
            {rows.map((p) => (
              <li key={p.id} data-testid="people-entry" className="space-y-2 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium [overflow-wrap:anywhere]">{p.name}</div>
                    {roleLine(p) ? (
                      <div className="text-xs text-muted-foreground">{roleLine(p)}</div>
                    ) : null}
                  </div>
                  {actions(p, true)}
                </div>
                {p.note ? (
                  <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {p.note}
                  </div>
                ) : null}
                <PersonContacts person={p} />
                <PersonOffers person={p} />
              </li>
            ))}
          </ol>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Offers</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} data-testid="people-row" className="align-top">
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{p.name}</div>
                    {roleLine(p) ? (
                      <div className="text-xs text-muted-foreground">{roleLine(p)}</div>
                    ) : null}
                    {p.note ? (
                      <div className="mt-1 max-w-xs text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {p.note}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <PersonContacts person={p} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <PersonOffers person={p} />
                  </TableCell>
                  <TableCell>{actions(p)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {params.get("q")
            ? "No one matches this search."
            : "No people yet. Add them from an offer's People card, or here."}
        </p>
      )}
      {editing ? (
        <PersonDialog
          key={editing.person?.id ?? "new"}
          person={editing.person}
          initial={editing.initial}
          pending={pending}
          errors={errors}
          duplicate={duplicate}
          useDuplicateLabel="Open"
          onUseDuplicate={(d) => {
            const row = byId.get(d.id);
            open({ person: row ?? d, initial: draftOf(row ?? d) });
          }}
          onClose={() => setEditing(null)}
          onSave={(d) =>
            run(
              () => (editing.person ? editPerson(null, editing.person.id, d) : addPerson(null, d)),
              () => setEditing(null),
            )
          }
        />
      ) : null}
      {merging ? (
        <MergeDialog
          person={merging}
          pending={pending}
          onClose={() => setMerging(null)}
          onMerge={(keepId, removeId) =>
            run(
              () => mergePerson(keepId, removeId),
              () => setMerging(null),
            )
          }
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          person={deleting}
          pending={pending}
          onClose={() => setDeleting(null)}
          onDelete={() =>
            run(
              () => removePerson(deleting.id),
              () => setDeleting(null),
            )
          }
        />
      ) : null}
    </div>
  );
}
