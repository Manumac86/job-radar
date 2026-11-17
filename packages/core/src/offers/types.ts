import { z } from "zod";

export const ENGAGEMENT = ["contract", "part-time", "full-time", "freelance", "unknown"] as const;
export const REMOTE = ["remote", "hybrid", "onsite", "unknown"] as const;
export const PERIODS = ["hour", "day", "week", "month", "year", "project"] as const;

export const compensationSchema = z.object({
  /** Minor units (cents). */
  min: z.number().int().nonnegative().nullable(),
  max: z.number().int().nonnegative().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  period: z.enum(PERIODS).nullable(),
});
export type Compensation = z.infer<typeof compensationSchema>;

/** One offer in the normalized shape (job-ingestion spec), before it is stored. */
export const normalizedOfferSchema = z.object({
  sourceId: z.string(),
  externalId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  companyWebsite: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  remotePolicy: z.enum(REMOTE).default("unknown"),
  regions: z.array(z.string()).default([]),
  engagementType: z.enum(ENGAGEMENT).default("unknown"),
  compensation: compensationSchema.nullable().default(null),
  equityMin: z.number().nullable().default(null),
  equityMax: z.number().nullable().default(null),
  postedAt: z.date().nullable().default(null),
  description: z.string().default(""),
  skills: z.array(z.string()).default([]),
  applyMethod: z.string().nullable().default(null),
  applyUrl: z.string().nullable().default(null),
  companyMeta: z.record(z.string(), z.unknown()).default({}),
  raw: z.unknown().optional(),
});
export type NormalizedOffer = z.infer<typeof normalizedOfferSchema>;
export type NormalizedOfferInput = z.input<typeof normalizedOfferSchema>;

/** What scoring and drafting need to know about an offer. */
export interface OfferForLlm {
  title: string;
  companyName: string;
  companyWebsite?: string | null;
  location?: string | null;
  remotePolicy: string;
  regions: string[];
  engagementType: string;
  compensation: Compensation | null;
  equityMin?: number | null;
  equityMax?: number | null;
  description: string;
  skills: string[];
  companyMeta: Record<string, unknown>;
  sourceUrl: string;
}

export function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

export function describeCompensation(c: Compensation | null): string {
  if (!c || (c.min === null && c.max === null)) return "not stated (rate unknown)";
  const cur = c.currency ?? "???";
  const range =
    c.min !== null && c.max !== null && c.max !== c.min
      ? `${formatMoney(c.min, cur)} – ${formatMoney(c.max, cur)}`
      : formatMoney((c.min ?? c.max) as number, cur);
  return `${range} per ${c.period ?? "unspecified period"}`;
}
export { excludedCompany, excludedCompanyReason } from "./prefilter";
export * from "./feedback";
