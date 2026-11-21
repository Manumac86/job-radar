// Mail accounts, read cursors and replies matched to applications (application-emails).
// Passwords are never stored here: they live in secrets/mail/<account-id>.
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "../client";
import {
  CLOSING_STAGES,
  applicationEmails,
  applications,
  companies,
  interviews,
  mailAccounts,
  nextSteps,
  mailCursors,
  offers,
  stageTransitions,
  type EmailStatus,
} from "../schema";

export type MailAccount = typeof mailAccounts.$inferSelect;
export type ApplicationEmail = typeof applicationEmails.$inferSelect;
export type NewApplicationEmail = typeof applicationEmails.$inferInsert;

export interface MailAccountInput {
  label: string;
  address: string;
  host: string;
  port?: number;
  folders?: string[];
  enabled?: boolean;
}

// ---------- accounts ----------

export function listMailAccounts(db: Db): MailAccount[] {
  return db.select().from(mailAccounts).orderBy(asc(mailAccounts.id)).all();
}

export function getMailAccount(db: Db, id: number): MailAccount | undefined {
  return db.select().from(mailAccounts).where(eq(mailAccounts.id, id)).get();
}

export function createMailAccount(db: Db, input: MailAccountInput): MailAccount {
  return db
    .insert(mailAccounts)
    .values({
      label: input.label,
      address: input.address,
      host: input.host,
      port: input.port ?? 993,
      folders: input.folders?.length ? input.folders : ["INBOX"],
      enabled: input.enabled ?? true,
    })
    .returning()
    .get();
}

export function updateMailAccount(
  db: Db,
  id: number,
  patch: Partial<MailAccountInput>,
  at = new Date(),
): MailAccount {
  const current = getMailAccount(db, id);
  if (!current) throw new Error(`Mail account ${id} not found`);
  const moved =
    (patch.host !== undefined && patch.host !== current.host) ||
    (patch.address !== undefined && patch.address !== current.address);
  const row = db
    .update(mailAccounts)
    .set({
      ...patch,
      ...(patch.folders ? { folders: patch.folders.length ? patch.folders : ["INBOX"] } : {}),
      ...(moved ? { status: "new" as const, lastError: null } : {}),
      updatedAt: at,
    })
    .where(eq(mailAccounts.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`Mail account ${id} not found`);
  // Another mailbox (or other folders) means the old cursors no longer apply.
  if (moved) db.delete(mailCursors).where(eq(mailCursors.accountId, id)).run();
  else if (patch.folders) {
    const keep = row.folders;
    db.delete(mailCursors)
      .where(and(eq(mailCursors.accountId, id), notInArray(mailCursors.folder, keep)))
      .run();
  }
  return row;
}

export function deleteMailAccount(db: Db, id: number): void {
  db.delete(mailAccounts).where(eq(mailAccounts.id, id)).run();
}

export function setMailAccountStatus(
  db: Db,
  id: number,
  status: { ok: true } | { ok: false; error: string },
  at = new Date(),
): void {
  db.update(mailAccounts)
    .set({
      status: status.ok ? "ok" : "failed",
      lastError: status.ok ? null : status.error,
      lastCheckedAt: at,
      updatedAt: at,
    })
    .where(eq(mailAccounts.id, id))
    .run();
}

/** The owner's own addresses: mail sent from them is never a reply. */
export function ownAddresses(db: Db): string[] {
  return listMailAccounts(db).map((a) => a.address.toLowerCase());
}

// ---------- cursors ----------

export interface MailCursor {
  uidValidity: string;
  lastUid: number;
}

export function getMailCursor(db: Db, accountId: number, folder: string): MailCursor | undefined {
  const row = db
    .select()
    .from(mailCursors)
    .where(and(eq(mailCursors.accountId, accountId), eq(mailCursors.folder, folder)))
    .get();
  return row ? { uidValidity: row.uidValidity, lastUid: row.lastUid } : undefined;
}

export function setMailCursor(
  db: Db,
  accountId: number,
  folder: string,
  cursor: MailCursor,
  at = new Date(),
): void {
  db.insert(mailCursors)
    .values({ accountId, folder, ...cursor, updatedAt: at })
    .onConflictDoUpdate({
      target: [mailCursors.accountId, mailCursors.folder],
      set: { ...cursor, updatedAt: at },
    })
    .run();
}

// ---------- candidates for the prefilter ----------

export interface OpenApplicationRow {
  applicationId: number;
  offerId: number;
  stage: string;
  appliedAt: Date;
  title: string;
  companyName: string;
  website: string | null;
}

/**
 * Applications a reply may concern: open ones, plus "no response" (a late reply becomes a
 * suggestion). Rejected, declined, withdrawn and accepted ones are left out.
 */
export function openApplications(db: Db): OpenApplicationRow[] {
  return db
    .select({
      applicationId: applications.id,
      offerId: offers.id,
      stage: applications.stage,
      appliedAt: applications.appliedAt,
      title: offers.title,
      companyName: offers.companyName,
      offerWebsite: offers.companyWebsite,
      companyWebsite: companies.website,
    })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .leftJoin(companies, eq(companies.id, offers.companyId))
    .where(
      notInArray(applications.stage, [
        ...CLOSING_STAGES.filter((s) => s !== "no_response"),
        "accepted",
      ]),
    )
    .orderBy(desc(applications.appliedAt))
    .all()
    .map(({ offerWebsite, companyWebsite, ...r }) => ({
      ...r,
      website: companyWebsite ?? offerWebsite ?? null,
    }));
}

// ---------- matched emails ----------

export function hasApplicationEmail(db: Db, messageId: string): boolean {
  return Boolean(
    db
      .select({ id: applicationEmails.id })
      .from(applicationEmails)
      .where(eq(applicationEmails.messageId, messageId))
      .get(),
  );
}

/** Stores a matched email once per Message-ID; returns null when it was already stored. */
export function insertApplicationEmail(
  db: Db,
  input: NewApplicationEmail,
): ApplicationEmail | null {
  return (
    db
      .insert(applicationEmails)
      .values({ ...input, excerpt: (input.excerpt ?? "").slice(0, 500) })
      .onConflictDoNothing({ target: applicationEmails.messageId })
      .returning()
      .get() ?? null
  );
}

export function getApplicationEmail(db: Db, id: number): ApplicationEmail | undefined {
  return db.select().from(applicationEmails).where(eq(applicationEmails.id, id)).get();
}

export function updateApplicationEmail(
  db: Db,
  id: number,
  patch: Partial<NewApplicationEmail>,
  at = new Date(),
): ApplicationEmail {
  const row = db
    .update(applicationEmails)
    .set({ ...patch, updatedAt: at })
    .where(eq(applicationEmails.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`Email ${id} not found`);
  return row;
}

/** Emails waiting for classification (the daily cap was reached), oldest first. */
export function queuedApplicationEmails(db: Db, limit = 50): ApplicationEmail[] {
  return db
    .select()
    .from(applicationEmails)
    .where(eq(applicationEmails.status, "queued"))
    .orderBy(asc(applicationEmails.receivedAt), asc(applicationEmails.id))
    .limit(limit)
    .all();
}

export function emailsForApplication(db: Db, applicationId: number): ApplicationEmail[] {
  return db
    .select()
    .from(applicationEmails)
    .where(eq(applicationEmails.applicationId, applicationId))
    .orderBy(asc(applicationEmails.receivedAt), asc(applicationEmails.id))
    .all();
}

export function emailsByStatus(db: Db, statuses: EmailStatus[]): ApplicationEmail[] {
  return db
    .select()
    .from(applicationEmails)
    .where(inArray(applicationEmails.status, statuses))
    .orderBy(desc(applicationEmails.receivedAt))
    .all();
}

export interface SuggestionRow {
  email: ApplicationEmail;
  /** Candidate applications with what the owner needs to pick one. */
  candidates: { applicationId: number; companyName: string; title: string; stage: string }[];
}

/** Pending suggestions with their candidate applications, newest first. */
export function pendingEmailSuggestions(db: Db): SuggestionRow[] {
  const rows = emailsByStatus(db, ["suggested"]);
  const ids = [...new Set(rows.flatMap((r) => [...r.candidates, r.applicationId ?? 0]))].filter(
    (n) => n > 0,
  );
  const apps = ids.length
    ? db
        .select({
          applicationId: applications.id,
          companyName: offers.companyName,
          title: offers.title,
          stage: applications.stage,
        })
        .from(applications)
        .innerJoin(offers, eq(offers.id, applications.offerId))
        .where(inArray(applications.id, ids))
        .all()
    : [];
  const byId = new Map(apps.map((a) => [a.applicationId, a]));
  return rows.map((email) => {
    const wanted = email.applicationId ? [email.applicationId] : email.candidates;
    return { email, candidates: wanted.flatMap((id) => byId.get(id) ?? []) };
  });
}

/** The stage transition an automatic update wrote for this email, if any. */
export function transitionForEmail(db: Db, emailId: number) {
  return db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.emailId, emailId))
    .orderBy(desc(stageTransitions.id))
    .get();
}

// ---------- helpers for applying and undoing email updates ----------

/** A reply counts as activity, and as the first response when there was none (D5). */
export function markApplicationReplied(db: Db, applicationId: number, at = new Date()): void {
  const app = db.select().from(applications).where(eq(applications.id, applicationId)).get();
  if (!app) return;
  db.update(applications)
    .set({ lastActivityAt: at, updatedAt: at, firstResponseAt: app.firstResponseAt ?? at })
    .where(eq(applications.id, applicationId))
    .run();
}

export function setFirstResponseAt(db: Db, applicationId: number, value: Date | null): void {
  db.update(applications)
    .set({ firstResponseAt: value })
    .where(eq(applications.id, applicationId))
    .run();
}

export function getInterview(db: Db, id: number) {
  return db.select().from(interviews).where(eq(interviews.id, id)).get();
}

/** Puts back the next step an email update replaced, or removes the one it created. */
export function restoreNextStep(
  db: Db,
  applicationId: number,
  previous: { description: string; dueAt: number | null; doneAt: number | null } | null,
): void {
  if (!previous) {
    db.delete(nextSteps).where(eq(nextSteps.applicationId, applicationId)).run();
    return;
  }
  db.update(nextSteps)
    .set({
      description: previous.description,
      dueAt: previous.dueAt === null ? null : new Date(previous.dueAt),
      doneAt: previous.doneAt === null ? null : new Date(previous.doneAt),
    })
    .where(eq(nextSteps.applicationId, applicationId))
    .run();
}
