import { describeCompensation, type OfferForLlm } from "../offers/types";
import type { Profile } from "../profile/schema";
import { UNTRUSTED_DATA_RULES, wrapUntrusted } from "../llm/untrusted";
import { companyProfileBlock, type CompanyProfileForPrompt } from "../research/prompt";
import { offerForPrompt, profileForPrompt } from "../scoring/prompt";

export function draftingSystem(maxWords: number): string {
  return [
    "You write job applications and freelance proposals for one candidate (the owner), who will review and send them manually.",
    `Write a cover message or proposal of at most ${maxWords} words, in the offer's language (English or Spanish), first person, concrete and specific to the offer. No greetings longer than one line, no buzzword lists.`,
    "Grounding rule: use ONLY facts present in the CV or profile. Never invent employers, dates, metrics, team sizes, client names, certifications or results.",
    "When the offer asks for something the CV does not state (a metric, a reference, a certification, a portfolio link), write a bracketed placeholder such as [metric: reduction in latency] and list it in verify_before_sending.",
    "Cite the one to three most relevant pieces of evidence from the CV for this offer.",
    "Company facts (product, a recent round, news) may come ONLY from the company profile block, when one is given. Mention at most two, never extend or embellish them, and list each one in company_facts_used with its source URL from the profile. Without a profile, company_facts_used is empty.",
    "Answer any screening questions found in the offer under the same grounding rule; leave screening_answers empty if there are none.",
    "Suggest a rate consistent with the owner's minimum and target rates (never below the minimum) in the offer's currency when it is one of the profile's currencies, else EUR; null for salaried full-time roles with a stated range.",
    UNTRUSTED_DATA_RULES,
  ].join("\n");
}

export function buildDraftPrompt(
  profile: Profile,
  offer: OfferForLlm,
  options: {
    instruction?: string | null;
    serviceLines?: string[];
    previousMessage?: string | null;
    company?: CompanyProfileForPrompt | null;
  } = {},
): string {
  return [
    "Candidate profile (trusted):",
    profileForPrompt(profile),
    "",
    "Candidate CV (trusted, the only source of facts):",
    profile.cv.slice(0, 10_000),
    "",
    options.serviceLines?.length
      ? `Matching service lines: ${options.serviceLines.join(", ")}\n`
      : "",
    `Offer compensation as stated: ${describeCompensation(offer.compensation)}`,
    options.company ? `${companyProfileBlock(options.company)}\n` : "",
    "Offer (untrusted data):",
    wrapUntrusted("offer", offerForPrompt(offer)),
    options.previousMessage ? `\nPrevious draft (for reference):\n${options.previousMessage}` : "",
    options.instruction
      ? `\nOwner's instruction for this version (trusted): ${options.instruction}`
      : "",
    "\nReturn the draft object.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
