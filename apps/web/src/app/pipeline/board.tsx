"use client";

import { appTimeZone } from "@job-radar/core/time";
import type { InterviewPlanData } from "@job-radar/db";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, Clock, GripVertical } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { moveApplication } from "./actions";
import { ApplicationSheet } from "./application-sheet";

export interface InterviewData {
  id: number;
  type: string;
  scheduledAt: string;
  timeZone: string;
  durationMinutes: number | null;
  interviewers: string[];
  link: string | null;
  prepNotes: string | null;
  outcome: string | null;
}

export interface EngagementData {
  rate: number;
  currency: string;
  ratePeriod: "hour" | "day" | "week" | "month" | "year" | "project";
  weeklyHours: number;
  startDate: string;
  endDate: string;
  clientContact: string;
  active: boolean;
}

export interface CardData {
  id: number;
  offerId: number;
  stage: string;
  title: string;
  company: string;
  score: number | null;
  appliedAt: string;
  staleNoResponse: boolean;
  nextStep: { description: string; dueAt: string | null } | null;
  nextInterviewAt: string | null;
  interviews: InterviewData[];
  engagement: EngagementData | null;
  canPrepare: boolean;
  prep: PrepData | null;
}

export interface PrepData {
  stage: string;
  stageLabel: string;
  createdAt: string;
  plan: InterviewPlanData;
}

export interface StageData {
  key: string;
  label: string;
  isClosing: boolean;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: appTimeZone(),
});

function Card({ card, onOpen }: { card: CardData; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        "rounded-md border bg-card p-2.5 text-sm shadow-xs",
        isDragging && "z-50 opacity-80 shadow-lg ring-2 ring-ring",
      )}
      data-testid="pipeline-card"
      data-application-id={card.id}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-label={`Drag ${card.title} at ${card.company}`}
          data-testid="drag-handle"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate font-medium">{card.company}</div>
          <div className="truncate text-xs text-muted-foreground">{card.title}</div>
        </button>
        <ScoreBadge
          score={card.score}
          scoreClass={
            card.score === null
              ? null
              : card.score >= 80
                ? "strong"
                : card.score >= 60
                  ? "possible"
                  : "weak"
          }
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {card.nextInterviewAt ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />{" "}
            {dateFmt.format(new Date(card.nextInterviewAt))}
          </span>
        ) : null}
        {card.nextStep ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {card.nextStep.description}
            {card.nextStep.dueAt ? ` · ${dateFmt.format(new Date(card.nextStep.dueAt))}` : ""}
          </span>
        ) : null}
        {card.engagement?.active ? (
          <Badge variant="secondary">{card.engagement.weeklyHours} h/wk</Badge>
        ) : null}
        {card.staleNoResponse ? <Badge variant="outline">14 days, no response?</Badge> : null}
      </div>
    </div>
  );
}

function Column({
  stage,
  cards,
  onOpen,
}: {
  stage: StageData;
  cards: CardData[];
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.label}
      data-testid={`column-${stage.key}`}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30",
        isOver && "ring-2 ring-ring",
        stage.isClosing && "bg-muted/60",
      )}
    >
      <header className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
        <span>{stage.label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
        {cards.map((c) => (
          <Card key={c.id} card={c} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </section>
  );
}

export function Board({ stages, cards }: { stages: StageData[]; cards: CardData[] }) {
  const [optimistic, moveOptimistic] = useOptimistic(
    cards,
    (state, move: { id: number; stage: string }) =>
      state.map((c) => (c.id === move.id ? { ...c, stage: move.stage } : c)),
  );
  const [, start] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const id = Number(event.active.id);
    const stage = event.over ? String(event.over.id) : null;
    const card = optimistic.find((c) => c.id === id);
    if (!stage || !card || card.stage === stage) return;
    start(async () => {
      moveOptimistic({ id, stage });
      const r = await moveApplication(id, stage);
      if (r.ok)
        toast.success(`${card.company} → ${stages.find((s) => s.key === stage)?.label ?? stage}`);
      else toast.error(r.error);
    });
  };

  if (!cards.length) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No applications yet. Open an offer, send your application yourself, then click &ldquo;Mark
        as applied&rdquo;.
      </div>
    );
  }

  const open = optimistic.find((c) => c.id === openId) ?? null;
  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => (
            <Column
              key={s.key}
              stage={s}
              cards={optimistic.filter((c) => c.stage === s.key)}
              onOpen={setOpenId}
            />
          ))}
        </div>
      </DndContext>
      <ApplicationSheet card={open} stages={stages} onClose={() => setOpenId(null)} />
    </>
  );
}
