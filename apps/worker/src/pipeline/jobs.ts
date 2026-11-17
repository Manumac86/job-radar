import { appTimeZone } from "@job-radar/core";
import {
  applicationsWithoutResponse,
  followUpsDue,
  interviewsNeedingReminder,
  markNoResponseSuggested,
  markReminderSent,
  type Db,
} from "@job-radar/db";
import type { Notifier } from "../notifier";

/** 14 days in "applied" with no update: suggest "no response" and a follow-up, once. */
export function suggestNoResponse(db: Db, notifier: Notifier, now = new Date()): number {
  let count = 0;
  for (const { application, offer } of applicationsWithoutResponse(db, now)) {
    notifier.notify({
      kind: "no_response",
      title: `No response from ${offer.companyName} after 14 days`,
      body: `Your application for ${offer.title} has had no update for 14 days. Mark it as "No response", or set a follow-up reminder on the pipeline board.`,
      offerId: offer.id,
      applicationId: application.id,
      dedupeKey: `no_response:${application.id}`,
    });
    markNoResponseSuggested(db, application.id, now);
    count++;
  }
  return count;
}

/** Interviews within the next 24 h get one reminder (again only if rescheduled). */
export function sendInterviewReminders(db: Db, notifier: Notifier, now = new Date()): number {
  let count = 0;
  for (const { interview, application, offer } of interviewsNeedingReminder(db, now)) {
    const when = new Intl.DateTimeFormat("en-GB", {
      timeZone: interview.timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(interview.scheduledAt);
    notifier.notify({
      kind: "interview_reminder",
      title: `Interview with ${offer.companyName}: ${when}`,
      body: [
        `${interview.type.replace(/_/g, " ")} interview for ${offer.title}.`,
        interview.link ? `Link: ${interview.link}` : "",
        interview.interviewers.length ? `With: ${interview.interviewers.join(", ")}` : "",
        interview.prepNotes ? `Prep: ${interview.prepNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      offerId: offer.id,
      applicationId: application.id,
      dedupeKey: `interview_reminder:${interview.id}:${interview.scheduledAt.getTime()}`,
    });
    markReminderSent(db, interview.id, now);
    count++;
  }
  return count;
}

/** Telegram reminder after N days in "applied" with no news, once per threshold. */
export function sendFollowUpReminders(
  db: Db,
  notifier: Notifier,
  days: number[],
  now = new Date(),
): number {
  let count = 0;
  for (const { application, offer, days: d, dedupeKey } of followUpsDue(db, days, now)) {
    const applied = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: appTimeZone(),
    }).format(application.appliedAt);
    notifier.notify({
      kind: "follow_up",
      title: `Follow up with ${offer.companyName}? ${d} days without news`,
      body: `You applied for ${offer.title} on ${applied} and nothing has changed for ${d} days. A short, polite follow-up often gets a reply: restate your fit in one line and ask about next steps. Log any answer on the pipeline board to stop these reminders.`,
      offerId: offer.id,
      applicationId: application.id,
      dedupeKey,
    });
    count++;
  }
  return count;
}
