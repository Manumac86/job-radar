import { z } from "zod";

export const DEFAULT_MAX_WORDS = 180;

export const modelDraftSchema = z
  .object({
    message: z.string().min(40).max(2500).describe("Cover message or proposal, plain text"),
    screening_answers: z
      .array(z.object({ question: z.string().max(400), answer: z.string().max(1500) }).strict())
      .max(10)
      .describe("Answers to screening questions found in the offer; empty if none"),
    suggested_rate: z
      .object({
        amount: z.number().positive(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        period: z.enum(["hour", "day", "month", "year", "project"]),
        reasoning: z.string().max(400),
      })
      .strict()
      .nullable(),
    verify_before_sending: z
      .array(z.string().max(300))
      .max(15)
      .describe("Claims or placeholders the owner must check before sending"),
    company_facts_used: z
      .array(z.object({ fact: z.string().max(200), source: z.string().max(2000) }).strict())
      .max(8)
      .default([])
      .describe(
        "Company profile facts the message mentions, each with its source URL; empty if none",
      ),
  })
  .strict();

export type ModelDraft = z.infer<typeof modelDraftSchema>;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
