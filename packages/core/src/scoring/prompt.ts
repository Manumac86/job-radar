import { describeCompensation, type OfferForLlm } from "../offers/types";
import type { Profile } from "../profile/schema";
import { UNTRUSTED_DATA_RULES, wrapUntrusted } from "../llm/untrusted";
import { companyProfileBlock, type CompanyProfileForPrompt } from "../research/prompt";

export const SCORING_SYSTEM = [
  "You evaluate job offers and freelance projects for one candidate (the owner) and return a structured fit score.",
  "Judge only from the candidate profile and the offer. Do not invent facts about either.",
  "The owner targets every role in target_roles: senior individual-contributor roles and leadership roles alike. Do not lower the score because a role is IC or because it is leadership; judge seniority fit against the role's own level.",
  "Do not speculate about the owner's availability or conflicts with current activities; engagement fit compares only the offer's engagement type and hours with the preferences.",
  "Sub-scores: skills (stack and domain overlap), seniority (for leadership roles use the owner's leadership evidence), rate (vs the owner's minimum and target; 50 if not stated), location (residency, work authorization, time-zone overlap), engagement (contract/part-time/full-time vs preferences).",
  "If the offer requires residency or work authorization the owner does not have, set eligibility.owner_eligible=false and list the place in restricted_to.",
  "For leadership roles compare the company's stage and engineering team size with the owner's target and add the red flag \"company stage above target\" when the company is larger or later-stage.",
  "When a researched company profile is given, use its funding stage and engineering team size for company.stage and company.engineering_team_size instead of guessing from the offer, and treat its red flags as red flags about the company.",
  "List red flags as short phrases. Pick service line ids only from the profile.",
  'The owner may list learned preferences from past decisions. When the offer clearly matches an [avoid] preference, lower the relevant sub-scores and the overall score and add the red flag "Matches what you avoid: <the preference without the word Avoid>". When it clearly matches a [prefer] preference, you may raise them. Learned preferences never override eligibility or rate rules.',
  'Write the rationale and red flags addressed to the candidate as "you" (for example "your EU authorization"); never use the candidate\'s name or gendered pronouns.',
  UNTRUSTED_DATA_RULES,
].join("\n");

export function profileForPrompt(profile: Profile): string {
  const p = profile.preferences;
  return JSON.stringify(
    {
      target_roles: p.target_roles,
      skills: p.skills,
      service_lines: p.service_lines,
      leadership_target: p.leadership_target,
      engagement: p.engagement,
      rates: p.rates,
      location: p.location,
      work_authorization: p.owner.work_authorization,
      timezone: p.owner.timezone,
      languages: p.owner.languages,
    },
    null,
    2,
  );
}

export function offerForPrompt(offer: OfferForLlm): string {
  return [
    `Title: ${offer.title}`,
    `Company: ${offer.companyName}${offer.companyWebsite ? ` (${offer.companyWebsite})` : ""}`,
    `Location: ${offer.location ?? "not stated"}; remote policy: ${offer.remotePolicy}; regions: ${offer.regions.join(", ") || "not stated"}`,
    `Engagement: ${offer.engagementType}`,
    `Compensation: ${describeCompensation(offer.compensation)}`,
    offer.equityMin !== null && offer.equityMin !== undefined
      ? `Equity: ${offer.equityMin}% – ${offer.equityMax ?? offer.equityMin}%`
      : "",
    offer.skills.length ? `Listed skills: ${offer.skills.join(", ")}` : "",
    Object.keys(offer.companyMeta).length
      ? `Company details: ${JSON.stringify(offer.companyMeta)}`
      : "",
    "",
    "Description:",
    offer.description.slice(0, 12_000),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export interface LearnedForPrompt {
  text: string;
  polarity: "avoid" | "prefer";
}

export function buildScoringPrompt(
  profile: Profile,
  offer: OfferForLlm,
  learned: LearnedForPrompt[] = [],
  company: CompanyProfileForPrompt | null = null,
): string {
  return [
    "Candidate profile (trusted):",
    profileForPrompt(profile),
    "",
    "Candidate CV (trusted):",
    profile.cv.slice(0, 8_000),
    "",
    ...(learned.length
      ? [
          "Owner's learned preferences (trusted, from past decisions):",
          ...learned.map((l) => `[${l.polarity}] ${l.text}`),
          "",
        ]
      : []),
    ...(company ? [companyProfileBlock(company), ""] : []),
    "Offer to evaluate (untrusted data):",
    wrapUntrusted("offer", offerForPrompt(offer)),
    "",
    "Return the score object.",
  ].join("\n");
}
