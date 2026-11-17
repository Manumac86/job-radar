import { capacityStatus, isInterviewStage } from "@job-radar/core/pipeline";
import {
  boardApplications,
  committedWeeklyHours,
  latestInterviewPreps,
  listStages,
  NO_RESPONSE_DAYS,
} from "@job-radar/db";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { readPreferences } from "@/lib/profile";
import { Board, type CardData } from "./board";

export const metadata: Metadata = { title: "Pipeline" };

/** Server-side mapping to serializable cards; "now" is passed in to keep rendering pure. */
function toCards(
  rows: ReturnType<typeof boardApplications>,
  at: Date,
  preps: ReturnType<typeof latestInterviewPreps>,
  labels: Map<string, string>,
): CardData[] {
  const now = at.getTime();
  return rows.map(({ application, offer, nextStep, interviews, engagement }) => ({
    id: application.id,
    offerId: offer.id,
    stage: application.stage,
    title: offer.title,
    company: offer.companyName,
    score: offer.score,
    appliedAt: application.appliedAt.toISOString(),
    staleNoResponse:
      application.stage === "applied" &&
      now - application.lastActivityAt.getTime() > NO_RESPONSE_DAYS * 86_400_000,
    nextStep:
      nextStep && !nextStep.doneAt
        ? { description: nextStep.description, dueAt: nextStep.dueAt?.toISOString() ?? null }
        : null,
    nextInterviewAt:
      interviews.find((i) => i.scheduledAt.getTime() > now)?.scheduledAt.toISOString() ?? null,
    interviews: interviews.map((i) => ({
      id: i.id,
      type: i.type,
      scheduledAt: i.scheduledAt.toISOString(),
      timeZone: i.timeZone,
      durationMinutes: i.durationMinutes,
      interviewers: i.interviewers,
      link: i.link,
      prepNotes: i.prepNotes,
      outcome: i.outcome,
    })),
    engagement: engagement
      ? {
          rate: engagement.rateMinor / 100,
          currency: engagement.currency,
          ratePeriod: engagement.ratePeriod,
          weeklyHours: engagement.weeklyHours,
          startDate: engagement.startDate,
          endDate: engagement.endDate ?? "",
          clientContact: engagement.clientContact ?? "",
          active: engagement.active,
        }
      : null,
    canPrepare: isInterviewStage(application.stage, labels.get(application.stage) ?? ""),
    prep: (() => {
      const p = preps.get(application.id);
      return p
        ? {
            stage: p.stage,
            stageLabel: labels.get(p.stage) ?? p.stage,
            createdAt: p.createdAt.toISOString(),
            plan: p.plan,
          }
        : null;
    })(),
  }));
}

export default function PipelinePage() {
  const d = db();
  const stages = listStages(d);
  const rows = boardApplications(d);
  const labels = new Map(stages.map((s) => [s.key, s.label]));
  const cards = toCards(rows, new Date(), latestInterviewPreps(d), labels);
  const { prefs } = readPreferences();
  const capacity = prefs
    ? capacityStatus(committedWeeklyHours(d), prefs.engagement.weekly_capacity_hours)
    : null;
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Drag a card to change its stage. Click a card for interviews, next step and engagement."
      />
      {capacity?.over ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle aria-hidden />
          <AlertTitle>Over capacity</AlertTitle>
          <AlertDescription>
            Active engagements commit {capacity.committed} h/week, above your capacity of{" "}
            {capacity.capacity} h/week.
          </AlertDescription>
        </Alert>
      ) : null}
      <Board
        stages={stages.map((s) => ({ key: s.key, label: s.label, isClosing: s.isClosing }))}
        cards={cards}
      />
    </>
  );
}
