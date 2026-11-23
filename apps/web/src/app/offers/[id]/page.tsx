import {
  currentDismissal,
  getApplicationForOffer,
  getOffer,
  interviewsFor,
  listDrafts,
  listStages,
  nextStepFor,
  offerLinksFor,
  offerTimeline,
  emailsForApplication,
  pendingPortalSuggestions,
  portalUpdatesForApplication,
  pendingEmailSuggestions,
  scoreHistory,
} from "@job-radar/db";
import { AlertTriangle, ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailEntry } from "@/components/email-entry";
import { PortalEntry } from "@/components/portal-entry";
import { db } from "@/lib/db";
import { toEmailView } from "@/lib/emails";
import { toPortalView } from "@/lib/portal-updates";
import {
  ENGAGEMENT_LABELS,
  formatDate,
  formatRate,
  REMOTE_LABELS,
  TRIAGE_LABELS,
} from "@/lib/format";
import { cvName, cvOptions } from "@/lib/profile";
import { companyCardData } from "@/lib/research";
import { CompanyCard } from "./company-card";
import { DraftsPanel } from "./drafts-panel";
import { OfferActions } from "./offer-actions";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const offer = getOffer(db(), Number((await params).id));
  return { title: offer ? `${offer.title} · ${offer.companyName}` : "Offer" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children || "—"}</dd>
    </div>
  );
}

/** Readable labels for source metadata keys; others are humanized ("seniority_level" → "Seniority level"). */
const META_LABELS: Record<string, string> = {
  via: "Imported via",
  linkedin: "Company on LinkedIn",
};

function metaLabel(key: string): string {
  const label = META_LABELS[key] ?? key.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** One source metadata entry: links get a full row and a short, wrapping label. */
function MetaField({ name, value }: { name: string; value: unknown }) {
  const url = httpUrl(value);
  if (!url) return <Field label={metaLabel(name)}>{String(value)}</Field>;
  const text = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
  return (
    <div className="col-span-2">
      <Field label={metaLabel(name)}>
        <a
          href={url.href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {text}
        </a>
      </Field>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-foreground/70" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default async function OfferPage({ params }: { params: Params }) {
  const offerId = Number((await params).id);
  if (!Number.isInteger(offerId)) notFound();
  const d = db();
  const offer = getOffer(d, offerId);
  if (!offer) notFound();
  const scores = scoreHistory(d, offerId);
  const current = scores[0];
  const drafts = listDrafts(d, offerId);
  const links = offerLinksFor(d, offerId);
  const timeline = offerTimeline(d, offerId).reverse();
  const application = getApplicationForOffer(d, offerId);
  const suggestionCandidates = new Map(
    pendingEmailSuggestions(d).map((s) => [s.email.id, s.candidates]),
  );
  const emailsById = new Map(
    (application ? emailsForApplication(d, application.id) : []).map((e) => [
      e.id,
      toEmailView(e, suggestionCandidates.get(e.id)),
    ]),
  );
  const portalCandidates = new Map(
    pendingPortalSuggestions(d).map((s) => [s.update.id, s.candidates]),
  );
  // The latest state of each portal update is shown once, at its newest timeline entry.
  const portalById = new Map(
    (application ? portalUpdatesForApplication(d, application.id) : []).map((u) => [
      u.id,
      toPortalView(
        u,
        portalCandidates.get(u.id),
        (key) => listStages(d).find((s) => s.key === key)?.label ?? key,
      ),
    ]),
  );
  const portalShown = new Set<number>();
  const dismissal = offer.triage === "dismissed" ? currentDismissal(d, offerId) : undefined;
  const stages = listStages(d);
  const interviews = application ? interviewsFor(d, application.id) : [];
  const nextStep = application ? nextStepFor(d, application.id) : undefined;
  const meta = offer.companyMeta;
  const simpleApplyMatch = simpleApplyMatchOf(offer.raw);
  const company = companyCardData(offer);
  const cvChoices = cvOptions();
  const recommendedCv =
    current?.recommendedCv && cvChoices.some((o) => o.id === current.recommendedCv)
      ? current.recommendedCv
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ScoreBadge
              score={offer.score}
              scoreClass={offer.scoreClass}
              status={offer.scoreStatus}
            />
            <h1 className="text-2xl font-semibold tracking-tight">{offer.title}</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            {offer.companyName}
            {offer.companyWebsite ? (
              <>
                {" · "}
                <a
                  href={offer.companyWebsite}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  website
                </a>
              </>
            ) : null}
            {" · "}
            <Badge variant="outline" data-testid="triage-state">
              {TRIAGE_LABELS[offer.triage]}
            </Badge>
            {application ? (
              <Badge className="ml-2" data-testid="application-stage">
                {stages.find((s) => s.key === application.stage)?.label ?? application.stage}
              </Badge>
            ) : null}
          </p>
          {offer.triage === "dismissed" ? (
            <p className="mt-1 text-sm text-muted-foreground" data-testid="dismiss-reason">
              Dismissed{offer.triageReason ? `: ${offer.triageReason}` : ""}
              {dismissal && !dismissal.learnable ? " (not used for learning)" : ""}
            </p>
          ) : offer.triageReason ? (
            <p className="mt-1 text-sm text-muted-foreground">Reason: {offer.triageReason}</p>
          ) : null}
        </div>
        <OfferActions
          offerId={offer.id}
          companyName={offer.companyName}
          sourceUrl={offer.applyUrl ?? offer.sourceUrl}
          triage={offer.triage}
          hasApplication={Boolean(application)}
          drafts={drafts.map((dr) => ({
            id: dr.id,
            version: dr.version,
            message: dr.message,
            cvVariant: dr.cvVariant,
          }))}
          cvOptions={cvChoices}
          recommendedCv={recommendedCv}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {current ? (
                <>
                  <p className="text-sm">{current.rationale}</p>
                  <div className="grid gap-3 sm:grid-cols-5">
                    <SubScore label="Skills" value={current.skillsFit} />
                    <SubScore label="Seniority" value={current.seniorityFit} />
                    <SubScore label="Rate" value={current.rateFit} />
                    <SubScore label="Location" value={current.locationFit} />
                    <SubScore label="Engagement" value={current.engagementFit} />
                  </div>
                  {current.recommendedCv ? (
                    <div
                      className="rounded-md border bg-muted/40 p-3 text-sm"
                      data-testid="cv-recommendation"
                    >
                      <p className="flex items-center gap-1.5 font-medium">
                        <FileText className="size-4" aria-hidden />
                        Recommended CV: {cvName(current.recommendedCv)}
                      </p>
                      {current.cvReason ? (
                        <p className="mt-1 text-muted-foreground">{current.cvReason}</p>
                      ) : null}
                      {current.cvGaps?.length ? (
                        <div className="mt-2">
                          <p className="text-xs font-medium">May be missing from this CV:</p>
                          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                            {current.cvGaps.map((g) => (
                              <li key={g}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {current.redFlags.length ? (
                    <ul className="space-y-1">
                      {current.redFlags.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-destructive">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {f}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {current.serviceLines.length
                      ? `Service lines: ${current.serviceLines.join(", ")} · `
                      : ""}
                    {current.regionBonus
                      ? `Model ${current.modelOverall} · +${current.regionBonus} preferred region (${current.preferredRegion}) · `
                      : current.overall !== current.modelOverall
                        ? `Capped from ${current.modelOverall} · `
                        : ""}
                    {current.model} · {formatDate(current.createdAt, true)}
                  </p>
                  {scores.length > 1 ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        Score history ({scores.length})
                      </summary>
                      <ul className="mt-2 space-y-1" data-testid="score-history">
                        {scores.map((s) => (
                          <li key={s.id} className="tabular-nums">
                            {formatDate(s.createdAt, true)} — {s.overall} ({s.scoreClass}) ·{" "}
                            {s.model}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {offer.scoreStatus === "scoring_failed"
                    ? `Scoring failed: ${offer.scoreError ?? "unknown error"}`
                    : offer.scoreStatus === "not_scored"
                      ? "Not scored: the offer was filtered before any LLM call."
                      : "Awaiting score."}
                </p>
              )}
            </CardContent>
          </Card>

          <DraftsPanel
            offerId={offer.id}
            drafts={drafts.map((dr) => ({
              id: dr.id,
              version: dr.version,
              message: dr.message,
              screeningAnswers: dr.screeningAnswers,
              suggestedRate: dr.suggestedRate,
              verifyBeforeSending: dr.verifyBeforeSending,
              companyFactsUsed: dr.companyFactsUsed,
              instruction: dr.instruction,
              model: dr.model,
              createdAt: formatDate(dr.createdAt, true),
              cvVariantName: dr.cvVariantName,
            }))}
            cvOptions={cvChoices}
            recommendedCv={recommendedCv}
          />

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[32rem] overflow-y-auto text-sm whitespace-pre-wrap">
                {offer.description || "No description."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3" data-testid="offer-details">
                <Field label="Rate">{formatRate(offer)}</Field>
                <Field label="Engagement">{ENGAGEMENT_LABELS[offer.engagementType]}</Field>
                <Field label="Remote">{REMOTE_LABELS[offer.remotePolicy]}</Field>
                <Field label="Regions">{offer.regions.join(", ")}</Field>
                <div className="col-span-2">
                  <Field label="Location">{offer.location}</Field>
                </div>
                <Field label="Posted">{formatDate(offer.postedAt)}</Field>
                <Field label="First seen">{formatDate(offer.firstSeenAt)}</Field>
                {offer.equityMin !== null ? (
                  <Field label="Equity">
                    {offer.equityMin}% – {offer.equityMax ?? offer.equityMin}%
                  </Field>
                ) : null}
                <Field label="Apply via">{offer.applyMethod}</Field>
                {simpleApplyMatch !== null ? (
                  <Field label="SimpleApply match">
                    {simpleApplyMatch}% (not used in the score)
                  </Field>
                ) : null}
                {offer.skills.length ? (
                  <div className="col-span-2">
                    <Field label="Skills">{offer.skills.join(", ")}</Field>
                  </div>
                ) : null}
                {Object.entries(meta)
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([k, v]) => (
                    <MetaField key={k} name={k} value={v} />
                  ))}
              </dl>
            </CardContent>
          </Card>

          {company ? (
            <CompanyCard offerId={offer.id} companyName={offer.companyName} data={company} />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Source links</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {links.map((l) => (
                  <li key={l.id}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {l.sourceId} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {application ? (
            <Card>
              <CardHeader>
                <CardTitle>Application</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Applied {formatDate(application.appliedAt)} ·{" "}
                  <Link href="/pipeline" className="underline">
                    open pipeline
                  </Link>
                </p>
                {nextStep && !nextStep.doneAt ? (
                  <p>
                    Next step: {nextStep.description}
                    {nextStep.dueAt ? ` (due ${formatDate(nextStep.dueAt)})` : ""}
                  </p>
                ) : null}
                {interviews.length ? (
                  <ul className="space-y-1">
                    {interviews.map((i) => (
                      <li key={i.id}>
                        {formatDate(i.scheduledAt, true)} — {i.type.replace(/_/g, " ")}
                        {i.outcome ? ` · ${i.outcome}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No interviews yet.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm" data-testid="timeline">
                {timeline.map((e) => {
                  const email =
                    e.kind === "email" ? emailsById.get(Number(e.data["emailId"])) : undefined;
                  const fromEmail = e.kind === "stage_changed" && e.data["source"] === "email";
                  const fromPortal =
                    e.kind === "stage_changed" && e.data["source"] === "greenhouse";
                  const portalId = Number(e.data["portalApplicationId"]);
                  const portalUpdate =
                    e.kind === "portal_status" && !portalShown.has(portalId)
                      ? portalById.get(portalId)
                      : undefined;
                  if (portalUpdate) portalShown.add(portalId);
                  return (
                    <li key={e.id}>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(e.at, true)}
                        {fromEmail ? " · from email" : ""}
                        {fromPortal ? " · from MyGreenhouse" : ""}
                      </span>
                      {email ? (
                        <EmailEntry email={email} />
                      ) : portalUpdate ? (
                        <PortalEntry update={portalUpdate} />
                      ) : (
                        <div className="[overflow-wrap:anywhere]">{e.message}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** SimpleApply's own match %, kept as metadata only (simpleapply-source spec). */
function simpleApplyMatchOf(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>)["simpleapplyMatch"];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
