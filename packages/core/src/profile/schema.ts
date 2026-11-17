import { z } from "zod";

const nonEmpty = z.string().trim().min(1, "must not be empty");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time like "08:30"');
const currencyAmounts = z
  .record(
    z.string().regex(/^[A-Z]{3}$/, "currency keys must be ISO codes like EUR"),
    z.number().positive(),
  )
  .refine((r) => Object.keys(r).length > 0, "must list at least one currency");

export const ENGAGEMENT_PREFERENCES = [
  "contract",
  "part-time",
  "full-time",
  "full-time-remote",
  "freelance",
] as const;

export const preferencesSchema = z
  .object({
    owner: z.object({
      name: nonEmpty,
      base_location: nonEmpty,
      timezone: nonEmpty.refine(isTimeZone, "must be an IANA time zone like Europe/Lisbon"),
      work_authorization: z.array(nonEmpty).min(1),
      languages: z.array(nonEmpty).default([]),
    }),
    target_roles: z.array(nonEmpty).min(1, "list at least one target role"),
    skills: z.array(nonEmpty).min(1, "list at least one skill"),
    service_lines: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/, "use kebab-case ids"),
          name: nonEmpty,
          evidence: nonEmpty,
        }),
      )
      .min(1),
    leadership_target: z
      .object({
        company_stage: z.array(nonEmpty).default(["pre-seed", "seed", "series-a", "series-b"]),
        max_engineering_team: z.number().int().positive().default(50),
      })
      .default({
        company_stage: ["pre-seed", "seed", "series-a", "series-b"],
        max_engineering_team: 50,
      }),
    engagement: z.object({
      types: z.array(z.enum(ENGAGEMENT_PREFERENCES)).min(1),
      weekly_capacity_hours: z.number().int().min(1).max(80),
      min_project_hours_per_week: z.number().int().min(0).default(0),
    }),
    rates: z.object({
      min_hourly: currencyAmounts,
      min_daily_eur: z.number().positive(),
      target_hourly: currencyAmounts.optional(),
    }),
    location: z.object({
      remote_only: z.boolean().default(true),
      accepted_regions: z.array(nonEmpty).min(1),
      max_overlap_required: z.string().optional(),
    }),
    keywords: z.object({
      include: z.array(nonEmpty).min(1, "list at least one include keyword"),
      exclude: z.array(nonEmpty).default([]),
      // Optional gate: when set, the offer title must contain at least one of these.
      title_include: z.array(nonEmpty).default([]),
      // Companies whose offers are never shown or scored (name match, case-insensitive).
      exclude_companies: z.array(nonEmpty).default([]),
    }),
    sources: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    scoring: z
      .object({
        thresholds: z
          .object({
            strong: z.number().int().min(1).max(100),
            possible: z.number().int().min(0).max(99),
          })
          .refine((t) => t.possible < t.strong, "possible must be lower than strong")
          .default({ strong: 80, possible: 60 }),
        models: z
          .object({ scoring: nonEmpty, drafting: nonEmpty })
          .default({ scoring: "haiku", drafting: "sonnet" }),
        daily_caps: z
          .object({
            scoring: z.number().int().min(0),
            drafts: z.number().int().min(0),
            research: z.number().int().min(0).max(100).default(10),
          })
          .default({ scoring: 300, drafts: 30, research: 10 }),
      })
      .default({
        thresholds: { strong: 80, possible: 60 },
        models: { scoring: "haiku", drafting: "sonnet" },
        daily_caps: { scoring: 300, drafts: 30, research: 10 },
      }),
    research: z
      .object({
        // Research the company of every offer scored strong (company-research spec).
        auto_strong: z.boolean().default(true),
      })
      .default({ auto_strong: true }),
    notifications: z
      .object({
        quiet_hours: z.object({ start: time, end: time }).default({ start: "22:00", end: "08:00" }),
        digest_time: time.default("08:30"),
        // Telegram reminders to follow up after this many days in "applied" without news.
        follow_up_days: z.array(z.number().int().min(1).max(90)).max(5).default([7]),
      })
      .default({
        quiet_hours: { start: "22:00", end: "08:00" },
        digest_time: "08:30",
        follow_up_days: [7],
      }),
  })
  .strict();

export type Preferences = z.infer<typeof preferencesSchema>;
export type PreferencesInput = z.input<typeof preferencesSchema>;

export interface Profile {
  preferences: Preferences;
  cv: string;
  loadedAt: Date;
}

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Turns zod issues into one readable line per field, e.g. `rates.min_hourly.EUR: expected number`. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.map(String).join(".") : "(root)";
    let message = issue.message;
    if (issue.code === "invalid_type") {
      message = issue.message.replace(/^Invalid input: /, "");
    } else if (issue.code === "unrecognized_keys") {
      message = `unknown field(s): ${issue.keys.join(", ")}`;
    }
    return `${path}: ${message}`;
  });
}
