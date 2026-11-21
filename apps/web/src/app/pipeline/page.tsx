import { capacityStatus, isInterviewStage } from "@job-radar/core/pipeline";
import {
  boardApplications,
  committedWeeklyHours,
  emailsForApplication,
  pendingEmailSuggestions,
  pendingPortalSuggestions,
  portalUpdatesForApplication,
  latestInterviewPreps,
  listStages,
  NO_RESPONSE_DAYS,
} from "@job-radar/db";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailEntry } from "@/components/email-entry";
import { PortalEntry } from "@/components/portal-entry";
import { db } from "@/lib/db";
import { toEmailView, type EmailView } from "@/lib/emails";
import { toPortalView, type PortalUpdateView } from "@/lib/portal-updates";
import { cvOptions, readPreferences } from "@/lib/profile";
import { Board, type CardData } from "./board";

export const metadata: Metadata = { title: "Pipeline" };

/** Server-side mapping to serializable cards; "now" is passed in to keep rendering pure. */
function toCards(
  rows: ReturnType<typeof boardApplications>,
  at: Date,
  preps: ReturnType<typeof latestInterviewPreps>,
  labels: Map<string, string>,
  emailsOf: (applicationId: number) => EmailView[],
  portalOf: (applicationId: number) => PortalUpdateView[] = () => [],
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
    cv: application.cvVariant
      ? { id: application.cvVariant, name: application.cvVariantName ?? application.cvVariant }
      : null,
    emails: emailsOf(application.id),
    portalUpdates: portalOf(application.id),
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
  const suggestions = pendingEmailSuggestions(d);
  const candidatesOf = new Map(suggestions.map((s) => [s.email.id, s.candidates]));
  const stageLabel = (key: string) => labels.get(key) ?? key;
  const portalSuggestions = pendingPortalSuggestions(d);
  const portalCandidatesOf = new Map(portalSuggestions.map((s) => [s.update.id, s.candidates]));
  const cards = toCards(
    rows,
    new Date(),
    latestInterviewPreps(d),
    labels,
    (id) =>
      emailsForApplication(d, id)
        .filter((e) => e.status !== "queued")
        .map((e) => toEmailView(e, candidatesOf.get(e.id))),
    (id) =>
      portalUpdatesForApplication(d, id).map((u) =>
        toPortalView(u, portalCandidatesOf.get(u.id), stageLabel),
      ),
  );
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
      {suggestions.length || portalSuggestions.length ? (
        <Card className="mb-4" data-testid="updates-to-review">
          <CardHeader>
            <CardTitle>Updates to review</CardTitle>
            <CardDescription>
              Replies and portal statuses Job Radar was not sure about. Apply one to update its
              application, or dismiss it.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {suggestions.map((s) => (
              <EmailEntry key={`e${s.email.id}`} email={toEmailView(s.email, s.candidates)} />
            ))}
            {portalSuggestions.map((s) => (
              <PortalEntry
                key={`p${s.update.id}`}
                update={toPortalView(s.update, s.candidates, stageLabel)}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Board
        stages={stages.map((s) => ({ key: s.key, label: s.label, isClosing: s.isClosing }))}
        cards={cards}
        cvOptions={cvOptions()}
      />
    </>
  );
}
