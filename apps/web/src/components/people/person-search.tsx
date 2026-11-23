"use client";

// "Add person": search all people, pick one, or create a new one from the typed name
// (people-directory D3). A plain combobox: input + listbox, arrows and Enter.
import { Plus, UserPlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { findPeople, type PersonView } from "@/app/offers/[id]/people-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { roleLine } from "./person-contacts";

export function PersonSearch({
  offerId,
  label = "Add person",
  allowCreate = true,
  exclude = [],
  onPick,
  onCreate,
}: {
  offerId?: number;
  label?: string;
  allowCreate?: boolean;
  exclude?: number[];
  onPick: (person: PersonView) => void;
  onCreate?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonView[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const seq = useRef(0);
  const excludeKey = exclude.join(",");

  useEffect(() => {
    const q = query.trim();
    const n = ++seq.current;
    if (!q) return;
    const t = setTimeout(() => {
      void findPeople(q, offerId).then((r) => {
        if (n === seq.current) {
          const skip = new Set(excludeKey.split(",").filter(Boolean).map(Number));
          setResults(r.filter((p) => !skip.has(p.id)));
          setActive(0);
        }
      });
    }, 150);
    return () => clearTimeout(t);
  }, [query, offerId, excludeKey]);

  const shown = query.trim() ? results : [];
  const canCreate = allowCreate && !!onCreate && !!query.trim();
  const options = shown.length + (canCreate ? 1 : 0);
  const close = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
  };
  const choose = (i: number) => {
    const p = shown[i];
    if (p) onPick(p);
    else if (canCreate) onCreate?.(query.trim());
    close();
  };

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="size-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          autoFocus
          role="combobox"
          aria-expanded={options > 0}
          aria-controls={listId}
          aria-activedescendant={options ? `${listId}-${active}` : undefined}
          aria-label="Search people"
          placeholder="Name, email, LinkedIn or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (!options) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % options);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + options) % options);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(active);
            }
          }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="People"
          className="mt-2 max-h-64 overflow-y-auto"
        >
          {shown.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="cursor-pointer rounded px-2 py-1.5 text-sm aria-selected:bg-muted"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <div className="font-medium">{p.name}</div>
              {roleLine(p) ? (
                <div className="text-xs text-muted-foreground">{roleLine(p)}</div>
              ) : null}
            </li>
          ))}
          {canCreate ? (
            <li
              id={`${listId}-${shown.length}`}
              role="option"
              aria-selected={active === shown.length}
              className="flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 text-sm aria-selected:bg-muted"
              onMouseEnter={() => setActive(shown.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(shown.length)}
            >
              <Plus className="size-3.5" /> Create {query.trim()}
            </li>
          ) : null}
          {query.trim() && !options ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No one found.</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
