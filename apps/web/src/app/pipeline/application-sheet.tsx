"use client";

import { appTimeZone } from "@job-radar/core/time";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { DatePicker, TimePicker } from "@/components/date-time-pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  finishNextStep,
  followUpIn,
  moveApplication,
  saveEngagement,
  saveInterview,
  saveNextStep,
  type ActionResult,
} from "./actions";
import type { CardData, StageData } from "./board";
import { InterviewPrepSection } from "./interview-prep";

const INTERVIEW_TYPES = [
  ["screening", "Screening"],
  ["technical", "Technical"],
  ["take_home_review", "Take-home review"],
  ["fit", "Fit / culture"],
  ["final", "Final"],
  ["other", "Other"],
] as const;

const COMMON_TIME_ZONES = [
  "Europe/Madrid",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

/** Common zones, with the browser's own zone first. */
function timeZones(): string[] {
  const own = appTimeZone();
  return [own, ...COMMON_TIME_ZONES.filter((z) => z !== own)];
}

function useAction() {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function StageForm({ card, stages }: { card: CardData; stages: StageData[] }) {
  const [stage, setStage] = useState(card.stage);
  const [note, setNote] = useState("");
  const { pending, run } = useAction();
  return (
    <Section title="Stage">
      <div className="flex gap-2">
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="flex-1" aria-label="Stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={pending || stage === card.stage}
          onClick={() =>
            run(
              () => moveApplication(card.id, stage, note),
              () => setNote(""),
            )
          }
        >
          Move
        </Button>
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note for the timeline"
        aria-label="Stage note"
      />
      {card.staleNoResponse ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          <span>No update for 14 days.</span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => moveApplication(card.id, "no_response"))}
          >
            Mark no response
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => followUpIn(card.id, 3))}
          >
            Remind me to follow up in 3 days
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function InterviewForm({ card }: { card: CardData }) {
  const { pending, run } = useAction();
  const [type, setType] = useState("technical");
  const [tz, setTz] = useState(appTimeZone);
  const fmt = (iso: string, zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const s = (k: string) => String(fd.get(k) ?? "");
    if (!s("date") || !s("time")) {
      toast.error("Pick the interview date and time");
      return;
    }
    run(
      () =>
        saveInterview(card.id, {
          type: type as "technical",
          date: s("date"),
          time: s("time"),
          timeZone: tz,
          durationMinutes: s("duration") ? Number(s("duration")) : undefined,
          interviewers: s("interviewers"),
          link: s("link"),
          prepNotes: s("prepNotes"),
          outcome: s("outcome"),
        }),
      () => form.reset(),
    );
  };

  return (
    <Section title="Interviews">
      {card.interviews.length ? (
        <ul className="space-y-2 text-sm" data-testid="interview-list">
          {card.interviews.map((i) => (
            <li key={i.id} className="rounded-md border p-2">
              <div className="font-medium">
                {INTERVIEW_TYPES.find(([k]) => k === i.type)?.[1] ?? i.type} ·{" "}
                {fmt(i.scheduledAt, i.timeZone)}
              </div>
              {i.interviewers.length ? (
                <div className="text-muted-foreground">With {i.interviewers.join(", ")}</div>
              ) : null}
              {i.link ? (
                <a href={i.link} target="_blank" rel="noreferrer noopener" className="underline">
                  Meeting link
                </a>
              ) : null}
              {i.prepNotes ? <p className="mt-1 whitespace-pre-wrap">{i.prepNotes}</p> : null}
              {i.outcome ? <p className="mt-1">Outcome: {i.outcome}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No interviews yet.</p>
      )}
      <form onSubmit={submit} className="grid grid-cols-2 gap-2" aria-label="Add interview">
        <div className="col-span-2 grid grid-cols-2 gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Interview type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVIEW_TYPES.map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger aria-label="Time zone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeZones().map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DatePicker name="date" required aria-label="Interview date" />
        <TimePicker name="time" required aria-label="Interview time" />
        <Input
          name="duration"
          type="number"
          min={5}
          placeholder="Minutes"
          aria-label="Duration in minutes"
        />
        <Input
          name="interviewers"
          placeholder="Interviewers (comma-separated)"
          aria-label="Interviewers"
        />
        <Input
          name="link"
          placeholder="Meeting link"
          className="col-span-2"
          aria-label="Meeting link"
        />
        <Textarea
          name="prepNotes"
          placeholder="Prep notes"
          className="col-span-2"
          aria-label="Prep notes"
        />
        <Input
          name="outcome"
          placeholder="Outcome (after the interview)"
          className="col-span-2"
          aria-label="Outcome"
        />
        <Button type="submit" disabled={pending} className="col-span-2">
          Add interview
        </Button>
      </form>
    </Section>
  );
}

function NextStepForm({ card }: { card: CardData }) {
  const { pending, run } = useAction();
  const [description, setDescription] = useState(card.nextStep?.description ?? "");
  const [due, setDue] = useState(card.nextStep?.dueAt?.slice(0, 10) ?? "");
  return (
    <Section title="Next step">
      <div className="flex gap-2">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Send portfolio"
          aria-label="Next step"
        />
        <DatePicker
          value={due}
          onChange={setDue}
          placeholder="Due date"
          className="w-44 shrink-0"
          aria-label="Next step due date"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => saveNextStep(card.id, description, due))}
        >
          Save next step
        </Button>
        {card.nextStep ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => finishNextStep(card.id),
                () => setDescription(""),
              )
            }
          >
            Mark done
          </Button>
        ) : null}
      </div>
    </Section>
  );
}

function EngagementForm({ card }: { card: CardData }) {
  const { pending, run } = useAction();
  const e = card.engagement;
  const [period, setPeriod] = useState<string>(e?.ratePeriod ?? "hour");
  const [active, setActive] = useState(e?.active ?? true);
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "");
    run(() =>
      saveEngagement(card.id, {
        rate: s("rate"),
        currency: s("currency").toUpperCase(),
        ratePeriod: period as "hour",
        weeklyHours: s("weeklyHours"),
        startDate: s("startDate"),
        endDate: s("endDate"),
        clientContact: s("clientContact"),
        active,
      }),
    );
  };
  return (
    <Section title="Engagement (accepted freelance or contract work)">
      <form onSubmit={submit} className="grid grid-cols-3 gap-2" aria-label="Engagement">
        <Input
          name="rate"
          type="number"
          step="0.01"
          min={0}
          defaultValue={e?.rate}
          placeholder="Rate"
          required
          aria-label="Rate"
        />
        <Input
          name="currency"
          defaultValue={e?.currency ?? "EUR"}
          maxLength={3}
          required
          aria-label="Currency"
        />
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger aria-label="Rate period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["hour", "day", "week", "month", "year", "project"].map((p) => (
              <SelectItem key={p} value={p}>
                per {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          name="weeklyHours"
          type="number"
          min={1}
          max={80}
          defaultValue={e?.weeklyHours}
          placeholder="Hours/week"
          required
          aria-label="Weekly hours"
        />
        <DatePicker
          name="startDate"
          defaultValue={e?.startDate}
          required
          placeholder="Start date"
          aria-label="Start date"
        />
        <DatePicker
          name="endDate"
          defaultValue={e?.endDate}
          placeholder="End date"
          aria-label="End date"
        />
        <Input
          name="clientContact"
          defaultValue={e?.clientContact}
          placeholder="Client contact"
          className="col-span-3"
          aria-label="Client contact"
        />
        <Label className="col-span-2 flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} /> Active
          engagement
        </Label>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </form>
    </Section>
  );
}

export function ApplicationSheet({
  card,
  stages,
  onClose,
}: {
  card: CardData | null;
  stages: StageData[];
  onClose: () => void;
}) {
  return (
    <Sheet open={card !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {card ? (
          <>
            <SheetHeader>
              <SheetTitle>{card.company}</SheetTitle>
              <SheetDescription>
                {card.title} ·{" "}
                <Link href={`/offers/${card.offerId}`} className="underline">
                  open offer and timeline
                </Link>
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <StageForm key={`stage-${card.id}-${card.stage}`} card={card} stages={stages} />
              <Separator />
              <InterviewPrepSection card={card} />
              <Separator />
              <InterviewForm key={`int-${card.id}`} card={card} />
              <Separator />
              <NextStepForm key={`ns-${card.id}-${card.nextStep?.description ?? ""}`} card={card} />
              <Separator />
              <EngagementForm key={`eng-${card.id}`} card={card} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
