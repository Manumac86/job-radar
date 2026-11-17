// Interview preparation plan (application-pipeline spec, "Interview prep"): generated with the
// drafting model when an application reaches an interview stage, grounded in the CV.
import { z } from "zod";
import { groundFigures } from "../drafts/grounding";
import { callStructured, type StructuredDeps } from "../llm/structured";
import { UNTRUSTED_DATA_RULES, wrapUntrusted } from "../llm/untrusted";
import type { OfferForLlm } from "../offers/types";
import type { Profile } from "../profile/schema";
import { companyProfileBlock, type CompanyProfileForPrompt } from "../research/prompt";
import { offerForPrompt, profileForPrompt } from "../scoring/prompt";

export { INTERVIEW_STAGES, isInterviewStage } from "../pipeline";

const text = (max: number) => z.string().min(1).max(max);

export const interviewPrepSchema = z
  .object({
    focus: text(600),
    likely_questions: z
      .array(
        z
          .object({
            question: text(300),
            why_they_ask: text(300),
            answer_outline: z.array(text(300)).min(1).max(5),
          })
          .strict(),
      )
      .min(3)
      .max(10),
    strengths_to_highlight: z
      .array(z.object({ point: text(200), cv_evidence: text(400) }).strict())
      .min(1)
      .max(6),
    gaps_to_prepare: z
      .array(z.object({ gap: text(200), how_to_prepare: text(400) }).strict())
      .max(6),
    questions_to_ask: z.array(text(300)).min(2).max(8),
    checklist: z.array(text(200)).max(10),
  })
  .strict();

export type InterviewPrepContent = z.infer<typeof interviewPrepSchema>;
/** Built from the company profile, not by the model, so every item keeps its source. */
export interface CompanyContext {
  researchedAt: string;
  website: string | null;
  product: { text: string; source: string } | null;
  stage: { text: string; source: string } | null;
  news: { date: string; headline: string; source: string }[];
  red_flags: { text: string; source: string }[];
}

export type InterviewPlan = InterviewPrepContent & {
  verify: string[];
  /** Company context from research, or why there is none. Absent on older plans. */
  company_context?: CompanyContext | { unavailable: string };
};

export function companyContextFrom(c: CompanyProfileForPrompt): CompanyContext {
  const p = c.profile;
  const f = p.funding?.value;
  return {
    researchedAt: c.researchedAt.toISOString(),
    website: p.website,
    product: p.product ? { text: p.product.value, source: p.product.sources[0] ?? "" } : null,
    stage:
      p.funding && f
        ? {
            text: [
              f.stage.replace(/-/g, " "),
              f.last_round ? `last round ${f.last_round}` : "",
              f.amount ?? "",
              f.date ? `(${f.date})` : "",
            ]
              .filter(Boolean)
              .join(", ")
              .replace(/, \(/, " ("),
            source: p.funding.sources[0] ?? "",
          }
        : null,
    news: p.news.slice(0, 5),
    red_flags: p.red_flags.slice(0, 5),
  };
}

export interface InterviewContext {
  stage: string;
  stageLabel: string;
  interview?: {
    type: string;
    scheduledAt: string;
    durationMinutes: number | null;
    interviewers: string[];
  } | null;
  /** Owner's notes so far (prep notes, outcomes of earlier rounds). */
  notes?: string[];
  /** Researched company profile, when one is available. */
  company?: CompanyProfileForPrompt | null;
}

export function interviewPrepSystem(): string {
  return [
    "You prepare one candidate (the owner) for a specific interview round of a job or freelance process.",
    "Tailor everything to the stage: a screening call checks motivation, logistics, rate and communication; a technical interview checks depth on the offer's stack and system design; a take-home checks scoping and code quality; a fit interview checks collaboration and values; a final interview checks seniority, impact and closing.",
    "likely_questions: the questions this company is most likely to ask in this round, why, and an answer outline in the owner's own experience.",
    "Grounding rule: answer outlines and cv_evidence use ONLY facts in the CV or profile. Never invent employers, projects, metrics, team sizes or results. When a good answer needs something the CV lacks, write a bracketed placeholder such as [example: a production incident you led].",
    "gaps_to_prepare: requirements of the offer the CV does not show, with a concrete way to prepare before the interview.",
    "questions_to_ask: sharp questions the owner should ask in this round. checklist: practical items (setup, materials, rate floor, availability).",
    "When a company profile is given, use its product, stage and recent news to make likely questions and questions_to_ask specific (for example about a recent launch), without adding facts it does not contain.",
    "Write in the offer's language (English or Spanish). Be concise and specific; no generic advice.",
    UNTRUSTED_DATA_RULES,
  ].join("\n");
}

export function buildInterviewPrepPrompt(
  profile: Profile,
  offer: OfferForLlm,
  ctx: InterviewContext,
): string {
  const i = ctx.interview;
  return [
    "Candidate profile (trusted):",
    profileForPrompt(profile),
    "",
    "Candidate CV (trusted, the only source of facts):",
    profile.cv.slice(0, 10_000),
    "",
    `Round to prepare: ${ctx.stageLabel} (${ctx.stage})`,
    i
      ? `Scheduled: ${i.type.replace(/_/g, " ")} on ${i.scheduledAt}${i.durationMinutes ? `, ${i.durationMinutes} min` : ""}${i.interviewers.length ? `, with ${i.interviewers.join(", ")}` : ""}`
      : "",
    ctx.notes?.length
      ? `Owner's notes so far (trusted):\n${ctx.notes.map((n) => `- ${n}`).join("\n")}`
      : "",
    ctx.company ? companyProfileBlock(ctx.company) : "",
    "Offer (untrusted data):",
    wrapUntrusted("offer", offerForPrompt(offer)),
    "\nReturn the interview preparation object.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Figures not found in the CV, profile or offer become "[VERIFY: …]" and are listed. */
export function groundInterviewPrep(
  prep: InterviewPrepContent,
  trusted: string[],
  offerText: string,
): InterviewPlan {
  const verify = new Set<string>();
  const ground = (t: string) => {
    const g = groundFigures(t, trusted, offerText);
    for (const r of g.replaced) verify.add(`Unverified figure "${r}" — not found in your CV`);
    for (const m of g.text.matchAll(/\[([^\]]{2,120})\]/g))
      if (!/^VERIFY: /i.test(m[1] ?? "")) verify.add(`Prepare: [${m[1]}]`);
    return g.text;
  };
  return {
    ...prep,
    likely_questions: prep.likely_questions.map((q) => ({
      ...q,
      answer_outline: q.answer_outline.map(ground),
    })),
    strengths_to_highlight: prep.strengths_to_highlight.map((s) => ({
      ...s,
      cv_evidence: ground(s.cv_evidence),
    })),
    verify: [...verify],
  };
}

export async function prepareInterview(
  deps: StructuredDeps,
  profile: Profile,
  offer: OfferForLlm,
  ctx: InterviewContext,
  options: { model?: string; companyUnavailable?: string } = {},
): Promise<{ plan: InterviewPlan; model: string }> {
  const res = await callStructured(deps, {
    kind: "drafting",
    model: options.model ?? profile.preferences.scoring.models.drafting,
    system: interviewPrepSystem(),
    prompt: buildInterviewPrepPrompt(profile, offer, ctx),
    schema: interviewPrepSchema,
    schemaName: "interview_prep",
  });
  const trusted = [profile.cv, JSON.stringify(profile.preferences), ...(ctx.notes ?? [])];
  const companyText = ctx.company ? JSON.stringify(ctx.company.profile) : "";
  const plan = groundInterviewPrep(
    res.value,
    trusted,
    `${offer.title}\n${offer.description}\n${companyText}`,
  );
  return {
    plan: {
      ...plan,
      company_context: ctx.company
        ? companyContextFrom(ctx.company)
        : { unavailable: options.companyUnavailable ?? "No company research available" },
    },
    model: res.model,
  };
}
