"use client";

import { appTimeZone } from "@job-radar/core/time";
import type { InterviewPlanData } from "@job-radar/db";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, Clock, GripVertical, Search } from "lucide-react";
import {
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
  type TouchEventHandler,
} from "react";
import { toast } from "sonner";
import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { EmailView } from "@/lib/emails";
import type { PortalUpdateView } from "@/lib/portal-updates";
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
  /** CV sent (cv-variants): a variant or the master CV; null when unknown. */
  cv: { id: string; name: string } | null;
  /** Emails matched to this application (application-emails), oldest first. */
  emails: EmailView[];
  /** Portal status updates for this application (mygreenhouse-source), newest first. */
  portalUpdates: PortalUpdateView[];
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

const CARD_CLASSES = "rounded-sm border bg-card p-2.5 text-sm";

/** What a card shows; the board card and the dragged copy above the columns share it. */
function CardBody({
  card,
  grip,
  onOpen,
}: {
  card: CardData;
  grip: ReactNode;
  onOpen?: () => void;
}) {
  const title = (
    <>
      <div className="truncate font-display text-base leading-tight font-normal">
        {card.company}
      </div>
      <div className="truncate text-xs text-muted-foreground">{card.title}</div>
    </>
  );
  return (
    <>
      <div className="flex items-start gap-1.5">
        {grip}
        {onOpen ? (
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            {title}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{title}</div>
        )}
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
        {card.emails.some((e) => e.status === "suggested") ||
        card.portalUpdates.some((u) => u.state === "suggested") ? (
          <Badge>Update to review</Badge>
        ) : null}
      </div>
    </>
  );
}

function Card({ card, onOpen }: { card: CardData; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  // Touch picks up the whole card after a hold; mouse and keyboard use the grip, as before (D6).
  const { onTouchStart, ...handleListeners } = listeners ?? {};
  return (
    <div
      ref={setNodeRef}
      className={cn(
        CARD_CLASSES,
        "touch-manipulation transition-colors duration-150 hover:border-foreground/30 pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
        // The copy in the DragOverlay moves; the card stays in its column, dimmed (A-0046).
        isDragging && "opacity-40",
      )}
      onTouchStart={onTouchStart as TouchEventHandler | undefined}
      data-testid="pipeline-card"
      data-application-id={card.id}
    >
      <CardBody
        card={card}
        onOpen={onOpen}
        grip={
          <button
            type="button"
            className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
            aria-label={`Drag ${card.title} at ${card.company}`}
            data-testid="drag-handle"
            {...handleListeners}
            {...attributes}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        }
      />
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
        "-ml-px flex h-full w-64 shrink-0 flex-col border bg-background first:ml-0 transition-colors duration-150",
        isOver && "relative z-10 border-flashlight bg-accent/60",
        stage.isClosing && "bg-muted/50",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 border-b px-3 py-2.5">
        <h2 className="truncate font-display text-lg leading-none">{stage.label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
      </header>
      <div
        className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain p-2"
        data-testid={`column-scroll-${stage.key}`}
      >
        {cards.map((c) => (
          <Card key={c.id} card={c} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </section>
  );
}

/** Case- and accent-insensitive text for the pipeline search. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function Board({
  stages,
  cards,
  cvOptions = [],
}: {
  stages: StageData[];
  cards: CardData[];
  cvOptions?: { id: string; name: string }[];
}) {
  const [optimistic, moveOptimistic] = useOptimistic(
    cards,
    (state, move: { id: number; stage: string }) =>
      state.map((c) => (c.id === move.id ? { ...c, stage: move.stage } : c)),
  );
  const [, start] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const needle = fold(query.trim());
  const visible = needle
    ? optimistic.filter((c) =>
        fold([c.company, c.title, c.nextStep?.description ?? ""].join(" ")).includes(needle),
      )
    : optimistic;
  const sensors = useSensors(
    // Mouse: a 4 px move, as before. Touch: press and hold, so a swipe scrolls (design D6).
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // The card being moved, drawn above every column (A-0046).
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragging = draggingId === null ? null : optimistic.find((c) => c.id === draggingId);

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
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
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        No applications yet. Open an offer, send your application yourself, then click &ldquo;Mark
        as applied&rdquo;.
      </div>
    );
  }

  const open = optimistic.find((c) => c.id === openId) ?? null;
  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDraggingId(Number(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search
              className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search company, role or next step"
              aria-label="Search pipeline"
              className="h-9 bg-card pl-8"
            />
          </div>
          {needle ? (
            <span className="text-sm text-muted-foreground" data-tabular role="status">
              {visible.length} of {optimistic.length} applications
            </span>
          ) : null}
        </div>
        {/* Full width with its own horizontal scroll; each column scrolls vertically. */}
        <div
          data-full-bleed
          className="flex h-[calc(100svh-17rem)] min-h-96 overflow-x-auto overscroll-x-contain"
          data-testid="pipeline-board"
          onWheel={(e) => {
            // Shift + wheel scrolls the board sideways anywhere over it, columns included,
            // also where the platform reports it as a vertical wheel.
            if (!e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
            e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {stages.map((s) => (
            <Column
              key={s.key}
              stage={s}
              cards={visible.filter((c) => c.stage === s.key)}
              onOpen={setOpenId}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div
              className={cn(CARD_CLASSES, "cursor-grabbing border-flashlight shadow-lg")}
              data-testid="drag-overlay"
            >
              <CardBody
                card={dragging}
                grip={
                  <span className="mt-0.5 text-muted-foreground">
                    <GripVertical className="size-4" aria-hidden />
                  </span>
                }
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <ApplicationSheet
        card={open}
        stages={stages}
        cvOptions={cvOptions}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
