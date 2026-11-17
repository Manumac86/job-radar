// The company profile the research agent returns (company-research spec, "Company profile";
// design D3). Every fact is `{ value, sources }` or null (unknown, never guessed).
import { z } from "zod";

export const COMPANY_STAGES = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "later",
  "public",
  "bootstrapped",
  "unknown",
] as const;

const url = z.string().max(2000);

function fact<T extends z.ZodType>(value: T) {
  return z
    .object({ value, sources: z.array(url).min(1).max(5) })
    .strict()
    .nullable();
}

export const companyProfileSchema = z
  .object({
    website: url
      .nullable()
      .describe("The company's own website you identified, so the owner can spot a mix-up"),
    product: fact(z.string().max(500)).describe("What the product does, in one or two sentences"),
    funding: fact(
      z
        .object({
          stage: z.enum(COMPANY_STAGES),
          last_round: z.string().max(80).nullable().describe('e.g. "Series B"'),
          date: z.string().max(10).nullable().describe("YYYY-MM or YYYY-MM-DD"),
          amount: z.string().max(60).nullable().describe('e.g. "12 M EUR"'),
        })
        .strict(),
    ),
    headcount: fact(z.number().int().min(1).max(5_000_000)).describe("Approximate employees"),
    engineering_team_size: fact(z.number().int().min(1).max(1_000_000)),
    headquarters: fact(z.string().max(150)),
    remote_policy: fact(z.string().max(200)),
    tech_stack: fact(z.array(z.string().max(40)).max(20)),
    news: z
      .array(
        z
          .object({
            date: z.string().max(10).describe("YYYY-MM or YYYY-MM-DD"),
            headline: z.string().max(200),
            source: url,
          })
          .strict(),
      )
      .max(10)
      .describe("News from the last 12 months"),
    red_flags: z
      .array(z.object({ text: z.string().max(200), source: url }).strict())
      .max(10)
      .describe("Layoffs, lawsuits, unpaid contractors, shutdown signs"),
  })
  .strict();

export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export type CompanyStage = (typeof COMPANY_STAGES)[number];

export type ProfileFactKey =
  | "product"
  | "funding"
  | "headcount"
  | "engineering_team_size"
  | "headquarters"
  | "remote_policy"
  | "tech_stack";

export const PROFILE_FACT_KEYS: ProfileFactKey[] = [
  "product",
  "funding",
  "headcount",
  "engineering_team_size",
  "headquarters",
  "remote_policy",
  "tech_stack",
];

export function emptyCompanyProfile(): CompanyProfile {
  return {
    website: null,
    product: null,
    funding: null,
    headcount: null,
    engineering_team_size: null,
    headquarters: null,
    remote_policy: null,
    tech_stack: null,
    news: [],
    red_flags: [],
  };
}
