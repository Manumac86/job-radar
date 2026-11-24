"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENGAGEMENT_LABELS, REMOTE_LABELS, TRIAGE_LABELS } from "@/lib/format";

const ANY = "__any";

function FilterSelect({
  label,
  param,
  options,
  value,
  onChange,
}: {
  label: string;
  param: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (param: string, value: string) => void;
}) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(param, v === ANY ? "" : v)}>
      <SelectTrigger
        size="sm"
        className="w-auto min-w-28 gap-3 bg-card data-[placeholder]:text-muted-foreground"
        aria-label={label}
        data-testid={`filter-${param}`}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OffersFilters({ sources }: { sources: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const set = (param: string, value: string) => update({ [param]: value });

  // Debounced free-text search.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const v = (k: string) => params.get(k) ?? "";
  const active = [...params.keys()].some((k) => k !== "sort" && k !== "dir" && k !== "page");

  return (
    <div className="mb-4 space-y-2" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, company, text"
            className="h-9 w-full bg-card pl-8"
            aria-label="Search offers"
          />
        </div>
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="show-applied"
            checked={v("applied") === "1"}
            onCheckedChange={(on) => set("applied", on ? "1" : "")}
          />
          <Label htmlFor="show-applied" className="text-sm font-normal">
            Show applied
          </Label>
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname));
            }}
          >
            <X aria-hidden /> Clear
          </Button>
        ) : null}
      </div>
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
        <FilterSelect
          label="Score"
          param="class"
          value={v("class")}
          onChange={set}
          options={[
            { value: "strong", label: "Strong (80+)" },
            { value: "possible", label: "Possible" },
            { value: "weak", label: "Weak" },
          ]}
        />
        <FilterSelect
          label="Engagement"
          param="engagement"
          value={v("engagement")}
          onChange={set}
          options={Object.entries(ENGAGEMENT_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Remote"
          param="remote"
          value={v("remote")}
          onChange={set}
          options={Object.entries(REMOTE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Source"
          param="source"
          value={v("source")}
          onChange={set}
          options={sources.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterSelect
          label="State"
          param="triage"
          value={v("triage")}
          onChange={set}
          options={Object.entries(TRIAGE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Posted"
          param="posted"
          value={v("posted")}
          onChange={set}
          options={[
            { value: "1", label: "Last 24 h" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
          ]}
        />
        <Input
          type="number"
          min={0}
          defaultValue={v("minRate")}
          onBlur={(e) => set("minRate", e.target.value)}
          placeholder="Min rate"
          className="h-8 w-28 bg-card"
          aria-label="Minimum stated rate"
        />
        <Input
          type="number"
          min={0}
          defaultValue={v("maxRate")}
          onBlur={(e) => set("maxRate", e.target.value)}
          placeholder="Max rate"
          className="h-8 w-28 bg-card"
          aria-label="Maximum stated rate"
        />
      </div>
    </div>
  );
}
