import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/client";
import { migrationsDir } from "../src/paths";
import {
  createApplication,
  createMailAccount,
  deleteMailAccount,
  emailsForApplication,
  getMailCursor,
  insertApplicationEmail,
  listMailAccounts,
  moveStage,
  openApplications,
  ownAddresses,
  pendingEmailSuggestions,
  queuedApplicationEmails,
  setMailCursor,
  transitionForEmail,
  transitionsFor,
  updateApplicationEmail,
  updateMailAccount,
} from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const email = (overrides: Partial<Parameters<typeof insertApplicationEmail>[1]> = {}) => ({
  messageId: "<a1@mail.example.invalid>",
  folder: "INBOX",
  receivedAt: new Date("2026-11-18T10:00:00Z"),
  fromAddress: "talent@northwind.example",
  subject: "Your application",
  ...overrides,
});

describe("application-emails migration", () => {
  it("upgrades a 0004 database and keeps its rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-db-"));
    dirs.push(dir);
    const old = join(dir, "migrations");
    cpSync(migrationsDir(), old, { recursive: true });
    const journalFile = join(old, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
      entries: { tag: string }[];
    };
    const before = journal.entries.filter((e) => !e.tag.startsWith("0005_"));
    expect(before.length).toBe(journal.entries.length - 1);
    writeFileSync(journalFile, JSON.stringify({ ...journal, entries: before }));
    const path = join(dir, "radar.sqlite");
    const first = openDatabase({ path, migrate: false });
    migrate(first, { migrationsFolder: old });
    seedSource(first);
    const offer = seedOffer(first);
    // Rows written the way a 0004 install wrote them (no source / email_id columns yet).
    const appId = Number(
      first.$client
        .prepare("insert into applications (offer_id, stage) values (?, 'screening_call')")
        .run(offer.id).lastInsertRowid,
    );
    first.$client
      .prepare(
        "insert into stage_transitions (application_id, from_stage, to_stage) values (?, 'applied', 'screening_call')",
      )
      .run(appId);
    closeDatabase(first);

    const upgraded = openDatabase({ path });
    const [t] = transitionsFor(upgraded, appId);
    expect(t).toMatchObject({ toStage: "screening_call", source: "manual", emailId: null });
    expect(listMailAccounts(upgraded)).toEqual([]);
    closeDatabase(upgraded);
  });

  it("stores a Message-ID once", () => {
    const db = memoryDb();
    expect(insertApplicationEmail(db, email())).not.toBeNull();
    expect(insertApplicationEmail(db, email({ subject: "again" }))).toBeNull();
  });
});

describe("mail accounts and cursors", () => {
  it("creates, edits and deletes accounts; a new host resets cursors", () => {
    const db = memoryDb();
    const a = createMailAccount(db, {
      label: "Personal",
      address: "Owner@Example.invalid",
      host: "imap.mail.me.com",
    });
    expect(a).toMatchObject({ port: 993, folders: ["INBOX"], enabled: true, status: "new" });
    expect(ownAddresses(db)).toEqual(["owner@example.invalid"]);
    setMailCursor(db, a.id, "INBOX", { uidValidity: "7", lastUid: 40 });
    setMailCursor(db, a.id, "Jobs", { uidValidity: "7", lastUid: 3 });
    updateMailAccount(db, a.id, { folders: ["INBOX"] });
    expect(getMailCursor(db, a.id, "INBOX")).toEqual({ uidValidity: "7", lastUid: 40 });
    expect(getMailCursor(db, a.id, "Jobs")).toBeUndefined();
    updateMailAccount(db, a.id, { host: "imap.gmail.com" });
    expect(getMailCursor(db, a.id, "INBOX")).toBeUndefined();
    deleteMailAccount(db, a.id);
    expect(listMailAccounts(db)).toEqual([]);
  });
});

describe("matched emails", () => {
  it("lists open applications with their website, and suggestions with candidates", () => {
    const db = memoryDb();
    seedSource(db);
    const o1 = seedOffer(db, {
      companyName: "Northwind",
      companyWebsite: "https://northwind.example",
    });
    const o2 = seedOffer(db, { title: "Staff Engineer" });
    const a1 = createApplication(db, { offerId: o1.id });
    const a2 = createApplication(db, { offerId: o2.id });
    moveStage(db, a2.id, "rejected");
    const open = openApplications(db);
    expect(open.map((r) => r.applicationId)).toEqual([a1.id]);
    expect(open[0]?.website).toBe("https://northwind.example");

    const e = insertApplicationEmail(db, { ...email(), candidates: [a1.id], status: "suggested" });
    expect(e).not.toBeNull();
    const [s] = pendingEmailSuggestions(db);
    expect(s?.candidates).toEqual([
      {
        applicationId: a1.id,
        companyName: "Northwind",
        title: "Senior AI Engineer",
        stage: "applied",
      },
    ]);
  });

  it("queues in arrival order, links transitions to the email and lists per application", () => {
    const db = memoryDb();
    seedSource(db);
    const app = createApplication(db, { offerId: seedOffer(db).id });
    const late = insertApplicationEmail(
      db,
      email({ messageId: "<late@x>", receivedAt: new Date("2026-11-19T00:00:00Z") }),
    );
    const early = insertApplicationEmail(db, email({ messageId: "<early@x>" }));
    expect(queuedApplicationEmails(db).map((e) => e.id)).toEqual([early?.id, late?.id]);
    if (!early) throw new Error("insert failed");
    updateApplicationEmail(db, early.id, { applicationId: app.id, status: "auto_applied" });
    moveStage(db, app.id, "screening_call", {
      source: "email",
      emailId: early.id,
      note: "From email",
    });
    expect(transitionForEmail(db, early.id)).toMatchObject({
      toStage: "screening_call",
      source: "email",
    });
    expect(emailsForApplication(db, app.id).map((e) => e.id)).toEqual([early.id]);
  });
});
