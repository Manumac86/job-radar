"use client";

import { ChevronLeft, ChevronRight, ListPlus, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * An editable list of short strings: Enter or comma adds, × removes, Backspace on an
 * empty input removes the last item, and the arrows move an item. "Paste many" edits
 * the list as one item per line.
 */
export function TagInput({
  label,
  value,
  onChange,
  placeholder,
  suggestions,
  invalid,
  splitOnComma = true,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: readonly string[];
  invalid?: boolean;
  /** Off for items that may contain commas (e.g. "Lisbon, Portugal"). */
  splitOnComma?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [bulk, setBulk] = useState<string | null>(null);

  const add = (raw: string) => {
    const parts = (splitOnComma ? raw.split(",") : [raw]).map((p) => p.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= value.length) return;
    const next = value.filter((_, k) => k !== i);
    next.splice(j, 0, value[i] ?? "");
    onChange(next);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || (splitOnComma && e.key === ",")) {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  if (bulk !== null) {
    return (
      <div className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <Textarea
          id={id}
          rows={Math.min(14, Math.max(4, value.length + 1))}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          aria-label={`${label} (one per line)`}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            const seen = new Set<string>();
            onChange(
              bulk
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase())),
            );
            setBulk(null);
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setBulk(value.join("\n"))}
        >
          <ListPlus aria-hidden /> Edit as lines
        </Button>
      </div>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-transparent p-1.5",
          invalid && "border-destructive",
        )}
        role="group"
        aria-label={`${label} items`}
      >
        {value.map((v, i) => (
          <Badge
            key={`${v}-${i}`}
            variant="secondary"
            className="max-w-full gap-0.5 pr-0.5 text-xs [&>button]:shrink-0"
          >
            {value.length > 1 && (
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${v} earlier`}
              >
                <ChevronLeft className="size-3" aria-hidden />
              </button>
            )}
            {/* Long tags wrap inside the field instead of widening the page. */}
            <span className="max-w-[18rem] min-w-0 whitespace-normal [overflow-wrap:anywhere]">
              {v}
            </span>
            {value.length > 1 && (
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                onClick={() => move(i, 1)}
                disabled={i === value.length - 1}
                aria-label={`Move ${v} later`}
              >
                <ChevronRight className="size-3" aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`Remove ${v}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ))}
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : (placeholder ?? "Type and press Enter")}
          list={suggestions ? `${id}-list` : undefined}
          className="h-7 min-w-[10rem] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
        {suggestions && (
          <datalist id={`${id}-list`}>
            {suggestions
              .filter((s) => !value.includes(s))
              .map((s) => (
                <option key={s} value={s} />
              ))}
          </datalist>
        )}
      </div>
    </div>
  );
}
