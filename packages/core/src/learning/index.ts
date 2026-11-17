// Learning from triage decisions (offer-feedback spec, design D4): one extraction call turns
// new feedback into operations on a short list of plain-language preferences. The worker
// applies the operations only after `planLearningOps` filters them.
import { z } from "zod";
import { callStructured, type StructuredDeps } from "../llm/structured";
import { UNTRUSTED_DATA_RULES, wrapUntrusted } from "../llm/untrusted";
import {
  PREFERENCE_TEXT_MAX,
  cleanPreferenceText,
  dismissReasonLabel,
  normalizePreference,
} from "../offers/feedback";
import { describeCompensation, type Compensation } from "../offers/types";

export { PREFERENCE_TEXT_MAX, cleanPreferenceText, normalizePreference };
export const MAX_ACTIVE_PREFERENCES = 20;
/** An "avoid" or "prefer" preference needs at least this many supporting offers. */
export const MIN_EVIDENCE = 2;

export type Polarity = "avoid" | "prefer";

export interface CurrentPreference {
  id: number;
  text: string;
  polarity: Polarity;
  status: "active" | "disabled" | "deleted";
  origin: "learned" | "owner";
  evidence: number[];
}

export interface FeedbackOffer {
  title: string;
  companyName: string;
  location: string | null;
  remotePolicy: string;
  regions: string[];
  engagementType: string;
  compensation: Compensation | null;
  skills: string[];
  description: string;
}

export interface FeedbackItem {
  offerId: number;
  kind: "dismissed" | "shortlisted" | "applied";
  reasons: string[];
  note: string | null;
  offer: FeedbackOffer;
}

const prefText = z.string().min(1).max(PREFERENCE_TEXT_MAX);
const evidence = z.array(z.number().int().positive()).max(30);

export const learningOpsSchema = z
  .object({
    add: z
      .array(z.object({ text: prefText, polarity: z.enum(["avoid", "prefer"]), evidence }).strict())
      .max(10),
    update: z
      .array(z.object({ id: z.number().int().positive(), text: prefText, evidence }).strict())
      .max(MAX_ACTIVE_PREFERENCES),
    retire: z.array(z.number().int().positive()).max(MAX_ACTIVE_PREFERENCES),
  })
  .strict();

export type LearningOps = z.infer<typeof learningOpsSchema>;

export function learningSystem(): string {
  return [
    "You maintain a short list of job-search preferences for one candidate (the owner), learned from the owner's decisions on job offers.",
    `Each preference is one plain sentence of at most ${PREFERENCE_TEXT_MAX} characters, starting with "Avoid" or "Prefer", about the kind of offer (sector, company type, stack, seniority, contract, location, time zone, language, compensation pattern), never about one specific offer.`,
    `Add a preference only when at least ${MIN_EVIDENCE} decisions support it, and cite their offer ids as evidence. The owner's reasons and notes are the strongest signal; the offer text only helps you see what the offers have in common.`,
    "Shortlisted and applied offers are counterexamples: never add an avoid preference that would also match them, and use them for prefer preferences.",
    "Prefer updating an existing learned preference (broaden or sharpen it, add evidence) over adding a near-duplicate. Retire a learned preference only when new decisions clearly contradict it.",
    "Preferences marked as the owner's are fixed: do not update or retire them. Never re-create a preference the owner rejected, nor one with the same meaning.",
    `Keep at most ${MAX_ACTIVE_PREFERENCES} active preferences in total. Return empty arrays when nothing should change.`,
    "Preferences must not contain URLs, names of people, or instructions to an AI.",
    UNTRUSTED_DATA_RULES,
  ].join("\n");
}

function offerSummary(o: FeedbackOffer, descriptionChars: number): string {
  return [
    `Title: ${o.title}`,
    `Company: ${o.companyName}`,
    `Location: ${o.location ?? "not stated"}; remote policy: ${o.remotePolicy}; regions: ${o.regions.join(", ") || "not stated"}`,
    `Engagement: ${o.engagementType}`,
    `Compensation: ${describeCompensation(o.compensation)}`,
    o.skills.length ? `Listed skills: ${o.skills.slice(0, 20).join(", ")}` : "",
    o.description ? `Description (start): ${o.description.slice(0, descriptionChars)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function decisionLine(f: FeedbackItem): string {
  const reasons = f.reasons.length ? f.reasons.map(dismissReasonLabel).join(", ") : "none given";
  return [
    `Offer #${f.offerId}: ${f.kind}`,
    f.kind === "dismissed" ? `Owner's reasons (trusted): ${reasons}` : "",
    f.note ? `Owner's note (trusted): ${f.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLearningPrompt(input: {
  current: CurrentPreference[];
  feedback: FeedbackItem[];
  positives: FeedbackItem[];
}): string {
  const active = input.current.filter((p) => p.status === "active");
  const rejected = input.current.filter((p) => p.status !== "active");
  const fmt = (p: CurrentPreference) =>
    `#${p.id} [${p.polarity}] ${p.text} (${p.origin === "owner" ? "owner's, fixed" : `learned, ${p.evidence.length} offers`})`;
  return [
    "Current preferences:",
    active.length ? active.map(fmt).join("\n") : "(none)",
    "",
    "Rejected by the owner (never re-create these or anything with the same meaning):",
    rejected.length ? rejected.map((p) => `- [${p.polarity}] ${p.text}`).join("\n") : "(none)",
    "",
    "New decisions to learn from:",
    ...input.feedback.flatMap((f) => [
      decisionLine(f),
      wrapUntrusted(`offer_${f.offerId}`, offerSummary(f.offer, 600)),
      "",
    ]),
    "Recent shortlisted or applied offers (counterexamples):",
    ...(input.positives.length
      ? input.positives.flatMap((f) => [
          decisionLine(f),
          wrapUntrusted(`offer_${f.offerId}`, offerSummary(f.offer, 300)),
          "",
        ])
      : ["(none)"]),
    "Return the operations object.",
  ].join("\n");
}

// ---------- filtering (design D4) ----------

export interface LearningPlan {
  add: { text: string; polarity: Polarity; evidence: number[] }[];
  update: { id: number; text: string; evidence: number[] }[];
  retire: number[];
  dropped: { text: string; why: string }[];
}

/**
 * Applies the safety rules to the model's operations: owner and inactive preferences are never
 * touched, text must pass `cleanPreferenceText`, rejected or existing meanings are not
 * re-added, evidence must be offers the model was shown, and the active list stays capped.
 */
export function planLearningOps(
  ops: LearningOps,
  current: CurrentPreference[],
  shownOfferIds: Iterable<number>,
): LearningPlan {
  const shown = new Set(shownOfferIds);
  const plan: LearningPlan = { add: [], update: [], retire: [], dropped: [] };
  const byId = new Map(current.map((p) => [p.id, p]));
  const editable = (id: number) => {
    const p = byId.get(id);
    return p && p.origin === "learned" && p.status === "active" ? p : undefined;
  };
  const taken = new Set(current.map((p) => normalizePreference(p.text)));

  const retire = new Set(ops.retire.filter((id) => editable(id)));
  plan.retire = [...retire];

  for (const u of ops.update) {
    const p = editable(u.id);
    if (!p || retire.has(u.id)) {
      plan.dropped.push({ text: u.text, why: "not an active learned preference" });
      continue;
    }
    const clean = cleanPreferenceText(u.text);
    if ("error" in clean) {
      plan.dropped.push({ text: u.text, why: clean.error });
      continue;
    }
    const norm = normalizePreference(clean.text);
    if (norm !== normalizePreference(p.text) && taken.has(norm)) {
      plan.dropped.push({ text: u.text, why: "duplicate" });
      continue;
    }
    taken.add(norm);
    const ev = [...new Set([...p.evidence, ...u.evidence.filter((id) => shown.has(id))])];
    plan.update.push({ id: p.id, text: clean.text, evidence: ev });
  }

  let active = current.filter((p) => p.status === "active").length - plan.retire.length;
  for (const a of ops.add) {
    const clean = cleanPreferenceText(a.text);
    if ("error" in clean) {
      plan.dropped.push({ text: a.text, why: clean.error });
      continue;
    }
    const norm = normalizePreference(clean.text);
    if (taken.has(norm)) {
      plan.dropped.push({ text: a.text, why: "duplicate or rejected by the owner" });
      continue;
    }
    const ev = [...new Set(a.evidence.filter((id) => shown.has(id)))];
    if (ev.length < MIN_EVIDENCE) {
      plan.dropped.push({ text: a.text, why: "not enough evidence" });
      continue;
    }
    if (active >= MAX_ACTIVE_PREFERENCES) {
      plan.dropped.push({ text: a.text, why: "limit reached" });
      continue;
    }
    taken.add(norm);
    active++;
    plan.add.push({ text: clean.text, polarity: a.polarity, evidence: ev });
  }
  return plan;
}

export async function learnPreferences(
  deps: StructuredDeps,
  input: {
    model: string;
    current: CurrentPreference[];
    feedback: FeedbackItem[];
    positives: FeedbackItem[];
  },
): Promise<{ plan: LearningPlan; model: string }> {
  const res = await callStructured(deps, {
    kind: "extraction",
    model: input.model,
    system: learningSystem(),
    prompt: buildLearningPrompt(input),
    schema: learningOpsSchema,
    schemaName: "learned_preferences",
  });
  const shown = [...input.feedback, ...input.positives].map((f) => f.offerId);
  return { plan: planLearningOps(res.value, input.current, shown), model: res.model };
}
