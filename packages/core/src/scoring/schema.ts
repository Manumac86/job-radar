import { z } from "zod";

const sub = z.number().int().min(0).max(100);

/** What the model must return. `.strict()` rejects any extra field. */
export const modelScoreSchema = z
  .object({
    overall: sub.describe("Overall fit 0-100 for this owner"),
    skills_fit: sub,
    seniority_fit: sub,
    rate_fit: sub.describe("50 when the rate is not stated"),
    location_fit: sub.describe("Location and time-zone eligibility"),
    engagement_fit: sub,
    rationale: z.string().min(20).max(900).describe("2-4 sentences"),
    red_flags: z.array(z.string().max(160)).max(10),
    service_lines: z
      .array(z.string())
      .max(5)
      .describe("Matching service line ids from the profile"),
    is_leadership: z.boolean().describe("CTO, Head/VP of Engineering or Engineering Manager role"),
    eligibility: z
      .object({
        restricted_to: z
          .array(z.string())
          .describe(
            "Countries/regions the offer requires residency or work authorization in; empty if none",
          ),
        owner_eligible: z
          .boolean()
          .describe("False when the owner lacks the required residency or authorization"),
      })
      .strict(),
    company: z
      .object({
        stage: z
          .enum([
            "pre-seed",
            "seed",
            "series-a",
            "series-b",
            "series-c",
            "later",
            "public",
            "unknown",
          ])
          .describe("Funding stage if stated or clearly implied"),
        engineering_team_size: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export type ModelScore = z.infer<typeof modelScoreSchema>;
