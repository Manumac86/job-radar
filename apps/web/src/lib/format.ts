import { appTimeZone } from "@job-radar/core/time";
import { describeCompensation } from "@job-radar/core/offers";

export interface RateFields {
  rateUnknown: boolean;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
  compPeriod: "hour" | "day" | "week" | "month" | "year" | "project" | null;
}

export function formatRate(o: RateFields): string {
  if (o.rateUnknown) return "Rate unknown";
  return describeCompensation({
    min: o.compMin,
    max: o.compMax,
    currency: o.compCurrency,
    period: o.compPeriod,
  })
    .replace(" per hour", "/h")
    .replace(" per day", "/day")
    .replace(" per year", "/yr")
    .replace(" per month", "/mo");
}

export function formatDate(d: Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: appTimeZone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function formatRelative(d: Date | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(d);
}

export const ENGAGEMENT_LABELS: Record<string, string> = {
  contract: "Contract",
  "part-time": "Part-time",
  "full-time": "Full-time",
  freelance: "Freelance",
  unknown: "Unknown",
};

export const REMOTE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unknown",
};

export const TRIAGE_LABELS: Record<string, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  dismissed: "Dismissed",
  filtered: "Filtered",
  archived: "Archived",
};
