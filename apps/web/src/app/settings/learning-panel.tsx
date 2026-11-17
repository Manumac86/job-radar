"use client";

import { PREFERENCE_TEXT_MAX } from "@job-radar/core/offers";
import { Ban, Brain, Check, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RescoreBanner } from "@/components/rescore-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionResult } from "./actions";
import {
  acceptSuggestion,
  addLearnedPreference,
  editLearned,
  learnNow,
  rejectSuggestion,
  setLearnedPreferenceStatus,
} from "./learning-actions";

export interface LearningData {
  preferences: {
    id: number;
    text: string;
    polarity: "avoid" | "prefer";
    status: "active" | "disabled" | "deleted";
    origin: "learned" | "owner";
    evidence: { id: number; title: string; company: string }[];
    evidenceCount: number;
  }[];
  suggestions: {
    id: number;
    kind: "raise_min_hourly" | "raise_min_daily";
    currency: string;
    value: number;
    current: number | null;
    evidenceCount: number;
  }[];
  pendingFeedback: number;
  lastRunAt: number | null;
  rescore: { suggested: boolean; openOffers: number };
}

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        after?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

function PolaritySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: "avoid" | "prefer") => void;
  id: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as "avoid" | "prefer")}>
      <SelectTrigger id={id} aria-label="Avoid or prefer" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="avoid">Avoid</SelectItem>
        <SelectItem value="prefer">Prefer</SelectItem>
      </SelectContent>
    </Select>
  );
}

function PreferenceRow({ p }: { p: LearningData["preferences"][number] }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.text);
  const [polarity, setPolarity] = useState(p.polarity);
  const { pending, run } = useRun();
  const disabled = p.status === "disabled";

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-3">
        <PolaritySelect id={`pol-${p.id}`} value={polarity} onChange={setPolarity} />
        <Input
          aria-label="Preference text"
          value={text}
          maxLength={PREFERENCE_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          className="min-w-56 flex-1"
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => editLearned(p.id, text, polarity),
              () => setEditing(false),
            )
          }
        >
          <Check aria-hidden /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </li>
    );
  }

  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
      data-testid="learned-preference"
      data-status={p.status}
    >
      <Badge variant={p.polarity === "avoid" ? "destructive" : "default"} className="w-14">
        {p.polarity === "avoid" ? "Avoid" : "Prefer"}
      </Badge>
      <span className={`min-w-0 flex-1 ${disabled ? "text-muted-foreground line-through" : ""}`}>
        {p.text}
      </span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {p.origin === "owner" ? <Badge variant="outline">Yours</Badge> : null}
        {disabled ? <Badge variant="outline">Disabled</Badge> : null}
        {p.evidenceCount ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="link" size="sm" className="h-auto p-0">
                {p.evidenceCount} offer{p.evidenceCount === 1 ? "" : "s"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <p className="mb-2 text-sm font-medium">Decisions behind it</p>
              <ul className="space-y-1 text-sm">
                {p.evidence.map((o) => (
                  <li key={o.id}>
                    <Link href={`/offers/${o.id}`} className="underline">
                      {o.title}
                    </Link>{" "}
                    <span className="text-muted-foreground">· {o.company}</span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        ) : null}
      </span>
      <span className="flex gap-1">
        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={disabled ? "Enable" : "Disable"}
          disabled={pending}
          onClick={() =>
            run(() => setLearnedPreferenceStatus(p.id, disabled ? "active" : "disabled"))
          }
        >
          {disabled ? <Power aria-hidden /> : <Ban aria-hidden />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Delete"
          disabled={pending}
          onClick={() => run(() => setLearnedPreferenceStatus(p.id, "deleted"))}
        >
          <Trash2 aria-hidden />
        </Button>
      </span>
    </li>
  );
}

function AddPreference() {
  const [text, setText] = useState("");
  const [polarity, setPolarity] = useState<"avoid" | "prefer">("avoid");
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-4">
      <div className="space-y-1">
        <Label htmlFor="new-pref-polarity">Type</Label>
        <PolaritySelect id="new-pref-polarity" value={polarity} onChange={setPolarity} />
      </div>
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="new-pref-text">Add your own</Label>
        <Input
          id="new-pref-text"
          value={text}
          maxLength={PREFERENCE_TEXT_MAX}
          placeholder="Avoid roles that require on-call weekends"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <Button
        disabled={pending || !text.trim()}
        onClick={() =>
          run(
            () => addLearnedPreference(text, polarity),
            () => setText(""),
          )
        }
      >
        <Plus aria-hidden /> Add
      </Button>
    </div>
  );
}

function Suggestions({ items }: { items: LearningData["suggestions"] }) {
  const { pending, run } = useRun();
  if (!items.length) return null;
  return (
    <Card data-testid="rate-suggestions">
      <CardHeader>
        <CardTitle>Suggestions</CardTitle>
        <CardDescription>
          Based on offers you dismissed as &quot;salary too low&quot;. Nothing changes until you
          accept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {s.kind === "raise_min_hourly"
                  ? `Raise your minimum hourly rate to ${s.value} ${s.currency}?`
                  : `Raise your minimum day rate to ${s.value} EUR?`}{" "}
                <span className="text-sm text-muted-foreground">
                  (now {s.current ?? "not set"}; {s.evidenceCount} offers paid more and you still
                  found them too low)
                </span>
              </span>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => acceptSuggestion(s.id))}
              >
                <Check aria-hidden /> Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => rejectSuggestion(s.id))}
              >
                <X aria-hidden /> No
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function LearningPanel({ data }: { data: LearningData }) {
  const { pending, run } = useRun();
  const active = data.preferences.filter((p) => p.status === "active").length;
  return (
    <div className="space-y-6">
      {data.rescore.suggested ? <RescoreBanner openOffers={data.rescore.openOffers} /> : null}
      <Suggestions items={data.suggestions} />
      <Card>
        <CardHeader>
          <CardTitle>What Job Radar learned</CardTitle>
          <CardDescription>
            Learned from your dismissals, shortlists and applications. Scoring lowers offers that
            match an Avoid and may raise ones that match a Prefer; hard rules (eligibility, minimum
            rate) always win. Edit a preference to make it yours: learning never changes it again. A
            deleted preference is not learned again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Brain aria-hidden className="size-4" />
            <span data-testid="learning-status">
              {active} active · {data.pendingFeedback} new decision
              {data.pendingFeedback === 1 ? "" : "s"} to learn from
              {data.lastRunAt
                ? ` · last run ${new Date(data.lastRunAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={pending}
              onClick={() => run(learnNow)}
            >
              <Brain aria-hidden /> Learn now
            </Button>
          </div>
          {data.preferences.length ? (
            <ul className="divide-y">
              {data.preferences.map((p) => (
                <PreferenceRow key={`${p.id}:${p.text}:${p.status}:${p.polarity}`} p={p} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing learned yet. Dismiss offers with a reason; after 5 dismissals (or with
              &quot;Learn now&quot;) Job Radar summarizes what you avoid.
            </p>
          )}
          <AddPreference />
        </CardContent>
      </Card>
    </div>
  );
}
