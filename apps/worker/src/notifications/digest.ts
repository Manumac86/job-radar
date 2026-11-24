import { appTimeZone, budgetDay, zonedParts } from "@job-radar/core";
import {
  applicationsInStage,
  interviewsBetween,
  nextStepsDueBetween,
  offersScoredBetween,
  type Db,
} from "@job-radar/db";
import type { Notifier } from "../notifier";
import type { ProfileService } from "../profile-service";
import { linkBase } from "./links";
import { offerRate } from "./messages";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface DigestDeps {
  db: Db;
  profile: ProfileService;
  webBaseUrl: string;
}

const tzOf = (d: DigestDeps) => d.profile.get()?.preferences.owner.timezone ?? appTimeZone();

/** Daily digest (notifications spec): last 24 h counts, top 5 by score, waiting, today. */
export function buildDigest(
  d: DigestDeps,
  at: Date,
): { title: string; text: string; html: string } {
  const since = new Date(at.getTime() - 86_400_000);
  const strong = offersScoredBetween(d.db, since, at, ["strong"]);
  const possible = offersScoredBetween(d.db, since, at, ["possible"]);
  const top = [...strong, ...possible].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const waiting = applicationsInStage(d.db, "applied");
  const tz = tzOf(d);
  const base = linkBase(d.profile, d.webBaseUrl);
  const p = zonedParts(at, tz);
  const dayStart = new Date(at.getTime() - (p.hour * 60 + p.minute) * 60_000);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const interviews = interviewsBetween(d.db, dayStart, dayEnd);
  const steps = nextStepsDueBetween(d.db, new Date(0), dayEnd);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = `Daily digest: ${strong.length} strong, ${possible.length} possible`;
  const html = [
    `<b>${escapeHtml(title)}</b>`,
    top.length
      ? "\n<b>Top offers (last 24 h)</b>"
      : "\nNo new strong or possible matches in the last 24 hours.",
    ...top.map(
      (o) =>
        `• ${o.score} — <a href="${base}/offers/${o.id}">${escapeHtml(o.title)}</a> at ${escapeHtml(o.companyName)} (${escapeHtml(offerRate(o))})`,
    ),
    `\n<b>Awaiting response:</b> ${waiting.length} application${waiting.length === 1 ? "" : "s"}`,
    interviews.length ? "\n<b>Interviews today</b>" : "",
    ...interviews.map(
      (i) =>
        `• ${time.format(i.interview.scheduledAt)} ${escapeHtml(i.offer.companyName)} — ${escapeHtml(i.interview.type.replace(/_/g, " "))}`,
    ),
    steps.length ? "\n<b>Next steps due</b>" : "",
    ...steps.map((s) => `• ${escapeHtml(s.step.description)} (${escapeHtml(s.offer.companyName)})`),
  ]
    .filter((l) => l !== "")
    .join("\n");
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return { title, text, html };
}

/** Creates today's digest once, at or after the configured time (Telegram delivers it if set). */
export function createDigestIfDue(d: DigestDeps & { notifier: Notifier }, at: Date): boolean {
  const digestTime = d.profile.get()?.preferences.notifications.digest_time ?? "08:30";
  const p = zonedParts(at, tzOf(d));
  const [h, m] = digestTime.split(":").map(Number);
  if (p.hour * 60 + p.minute < (h ?? 8) * 60 + (m ?? 30)) return false;
  const digest = buildDigest(d, at);
  return (
    d.notifier.notify({
      kind: "digest",
      title: digest.title,
      body: digest.text,
      dedupeKey: `digest:${budgetDay(at)}`,
    }) !== null
  );
}
