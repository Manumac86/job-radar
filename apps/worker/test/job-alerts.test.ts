// job-alert-mailboxes: the job-alert source reads the owner's email accounts through the mail
// service's read-only connector, with alert cursors apart from the reply cursors.
import { FakeLlmClient, LlmBudget } from "@job-radar/core";
import {
  getMailAccount,
  getMailCursor,
  getSource,
  listMailAccounts,
  listOffers,
  llmUsageStore,
  updateSource,
  upsertSource,
} from "@job-radar/db";
import { emailAlertsAdapter, type ImapAccount, type ReadOnlyImap } from "@job-radar/sources";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeRun } from "../src/ingest/runner";
import { setLogSink } from "../src/log";
import { MailService } from "../src/mail/service";
import { Notifier } from "../src/notifier";
import { testContext } from "./helpers";

interface Msg {
  uid: number;
  from: string;
  subject: string;
  html: string;
}

const NOW = new Date("2026-11-21T10:00:00Z");
const PASSWORD = "wxyz-alert-pass-0001";

const linkedinAlert = (uid: number, jobId: string, title: string): Msg => ({
  uid,
  from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
  subject: `${title} and more`,
  html: `<table><tr><td><a href="https://www.linkedin.com/comm/jobs/view/${jobId}">${title}</a><div>Northwind Analytics</div><div>European Union (Remote)</div></td></tr></table>`,
});

const greenhouseAlert = (uid: number): Msg => ({
  uid,
  from: "MyGreenhouse <no-reply@us.greenhouse-mail.io>",
  subject: "New jobs matching your alert",
  html: `<table><tr><td><a href="https://job-boards.greenhouse.io/contosolabs/jobs/5512345">Staff Platform Engineer</a><div>Contoso Labs</div><div>Remote - Europe</div></td></tr></table>`,
});

const personal = (uid: number): Msg => ({
  uid,
  from: "A Friend <friend@example.invalid>",
  subject: "Dinner on Friday?",
  html: `<p>See https://example.invalid/menu</p>`,
});

/** A read-only fake server per mailbox address; logs EXAMINE and body downloads. */
function fakeServers(
  mailboxes: Record<string, Record<string, Msg[]>>,
  opts: { failLogin?: string[] } = {},
) {
  const log: string[] = [];
  const connect = (account: ImapAccount): ReadOnlyImap => {
    const folders = mailboxes[account.user] ?? {};
    let open = "";
    return {
      async connect() {
        if (opts.failLogin?.includes(account.user))
          throw Object.assign(new Error("Command failed"), { authenticationFailed: true });
      },
      async mailboxOpen(path, options) {
        if (!options.readOnly) throw new Error("must be read-only");
        if (!folders[path])
          throw Object.assign(new Error("Command failed"), { serverResponseCode: "NONEXISTENT" });
        open = path;
        log.push(`${account.user} EXAMINE ${path}`);
        return { uidValidity: 7n, exists: folders[path]!.length };
      },
      async search(query) {
        const msgs = folders[open]!;
        if (typeof query["uid"] === "string") {
          const from = Number(String(query["uid"]).split(":")[0]);
          const hits = msgs.filter((m) => m.uid >= from).map((m) => m.uid);
          return hits.length ? hits : msgs.slice(-1).map((m) => m.uid);
        }
        return msgs.map((m) => m.uid);
      },
      async *fetch(range) {
        for (const m of folders[open]!.filter((x) => range.includes(x.uid))) {
          const [, name, address] = /^(.*) <(.*)>$/.exec(m.from) ?? [];
          yield {
            uid: m.uid,
            envelope: { subject: m.subject, date: NOW, from: [{ name, address }] },
            internalDate: NOW,
          };
        }
      },
      async fetchOne(uid) {
        const m = folders[open]!.find((x) => x.uid === Number(uid));
        if (!m) return false;
        log.push(`${account.user} BODY ${open} ${uid}`);
        const raw = [
          `From: ${m.from}`,
          `Subject: ${m.subject}`,
          `Message-ID: <${open}-${m.uid}@${account.user.split("@")[1]}>`,
          `Date: ${NOW.toUTCString()}`,
          "Content-Type: text/html; charset=utf-8",
          "",
          m.html,
        ].join("\r\n");
        return { source: Buffer.from(raw) };
      },
      async logout() {},
      close() {},
    };
  };
  return { connect, log };
}

function setup(servers: ReturnType<typeof fakeServers>) {
  const ctx = testContext();
  const secretsDir = mkdtempSync(join(tmpdir(), "job-radar-secrets-"));
  const notifier = new Notifier(ctx.db);
  const llm = new FakeLlmClient([]);
  const budget = new LlmBudget(llmUsageStore(ctx.db), () => ({
    scoring: 300,
    drafts: 30,
    research: 10,
  }));
  const mail = new MailService({
    db: ctx.db,
    profile: ctx.profile,
    notifier,
    llm: { client: llm, budget },
    secretsDir,
    connect: servers.connect,
    now: () => NOW,
  });
  upsertSource(ctx.db, {
    id: "email_alerts",
    type: "email_alerts",
    name: "Job-alert emails",
    settings: { lookback_days: 3 },
  });
  const run = () =>
    executeRun(
      {
        db: ctx.db,
        profile: ctx.profile,
        notifier,
        dataDir: secretsDir,
        secretsDir,
        adapters: { email_alerts: emailAlertsAdapter },
        mail: mail.alertConnector(),
        llm: { client: llm, budget },
        now: () => NOW,
      },
      "email_alerts",
      "manual",
    );
  return { ...ctx, mail, llm, secretsDir, run };
}

const lines: string[] = [];
afterEach(() => {
  setLogSink((line) => process.stderr.write(line + "\n"));
  lines.length = 0;
});

describe("job alerts from the email accounts", () => {
  it("reads two accounts; INBOX downloads only alert senders; a second run reads nothing", async () => {
    const servers = fakeServers({
      "owner@gmail.example.invalid": {
        "job-alerts": [linkedinAlert(1, "4012345678", "AI Engineer")],
      },
      "owner@icloud.example.invalid": { INBOX: [greenhouseAlert(10), personal(11)] },
    });
    const s = setup(servers);
    const gmail = s.mail.createAccount(
      {
        label: "Gmail",
        address: "owner@gmail.example.invalid",
        host: "imap.gmail.com",
        jobAlerts: true,
        alertFolders: ["job-alerts"],
      },
      PASSWORD,
    );
    s.mail.createAccount(
      {
        label: "iCloud",
        address: "owner@icloud.example.invalid",
        host: "imap.mail.me.com",
        jobAlerts: true,
        alertsInInbox: true,
      },
      PASSWORD,
    );
    const first = await s.run();
    expect(first.status).toBe("finished");
    if (first.status !== "finished") return;
    expect(first.run).toMatchObject({ status: "ok", found: 2, newCount: 2, error: null });
    expect(
      listOffers(s.db, {})
        .rows.map((o) => o.title)
        .sort(),
    ).toEqual(["AI Engineer", "Staff Platform Engineer"]);
    expect(servers.log.filter((l) => l.includes("BODY"))).toEqual([
      "owner@gmail.example.invalid BODY job-alerts 1",
      "owner@icloud.example.invalid BODY INBOX 10",
    ]);
    expect(s.llm.requests).toHaveLength(0);
    // Alert cursors are separate from the reply reader's.
    expect(getMailCursor(s.db, gmail.id, "job-alerts", "alerts")).toEqual({
      uidValidity: "7",
      lastUid: 1,
    });
    expect(getMailCursor(s.db, gmail.id, "job-alerts")).toBeUndefined();

    servers.log.length = 0;
    const second = await s.run();
    if (second.status !== "finished") throw new Error("no run");
    expect(second.run).toMatchObject({ status: "ok", found: 0 });
    expect(servers.log.filter((l) => l.includes("BODY"))).toEqual([]);
  });

  it("the same alert in two mailboxes is imported once", async () => {
    const alert = linkedinAlert(1, "4099999999", "Head of Engineering");
    const servers = fakeServers({
      "a@example.invalid": { "job-alerts": [alert] },
      "b@example.invalid": { "job-alerts": [alert] },
    });
    const s = setup(servers);
    for (const address of ["a@example.invalid", "b@example.invalid"]) {
      s.mail.createAccount(
        {
          label: address,
          address,
          host: "imap.example.invalid",
          jobAlerts: true,
          alertFolders: ["job-alerts"],
        },
        PASSWORD,
      );
    }
    const out = await s.run();
    if (out.status !== "finished") throw new Error("no run");
    expect(out.run).toMatchObject({ status: "ok", found: 2, newCount: 1 });
    expect(listOffers(s.db, {}).total).toBe(1);
  });

  it("one account failing: the other is read and the run names the failed account", async () => {
    const servers = fakeServers(
      { "ok@example.invalid": { "job-alerts": [linkedinAlert(1, "4011111111", "AI Lead")] } },
      { failLogin: ["bad@example.invalid"] },
    );
    const s = setup(servers);
    s.mail.createAccount(
      {
        label: "Good",
        address: "ok@example.invalid",
        host: "imap.example.invalid",
        jobAlerts: true,
        alertFolders: ["job-alerts"],
      },
      PASSWORD,
    );
    s.mail.createAccount(
      {
        label: "Work",
        address: "bad@example.invalid",
        host: "imap.work.invalid",
        jobAlerts: true,
        alertFolders: ["job-alerts"],
      },
      PASSWORD,
    );
    const out = await s.run();
    if (out.status !== "finished") throw new Error("no run");
    expect(out.run.status).toBe("ok");
    expect(out.run.newCount).toBe(1);
    expect(out.run.error).toMatch(/^Work: imap\.work\.invalid rejected the login/);
    expect(getSource(s.db, "email_alerts")?.status).toBe("ok");
  });
});

describe("moving the old single-mailbox setup", () => {
  function oldSetup(s: ReturnType<typeof setup>, user: string) {
    updateSource(s.db, "email_alerts", {
      settings: { user, label: "job-alerts", host: "imap.gmail.com", port: 993, lookback_days: 3 },
    });
    writeFileSync(join(s.secretsDir, "imap_app_password"), `${PASSWORD}\n`, { mode: 0o600 });
  }

  it("turns alerts on for the account with that address, once", () => {
    setLogSink((l) => lines.push(l));
    const s = setup(fakeServers({}));
    const a = s.mail.createAccount(
      { label: "Personal", address: "Owner@Gmail.example.invalid", host: "imap.gmail.com" },
      PASSWORD,
    );
    oldSetup(s, "owner@gmail.example.invalid");
    expect(s.mail.migrateAlertMailbox()).toEqual({
      migrated: true,
      accountId: a.id,
      created: false,
    });
    expect(getMailAccount(s.db, a.id)).toMatchObject({
      jobAlerts: true,
      alertFolders: ["job-alerts"],
      folders: ["INBOX"],
    });
    expect(getSource(s.db, "email_alerts")?.settings).toMatchObject({
      migrated: true,
      lookback_days: 3,
    });
    expect(s.mail.migrateAlertMailbox()).toEqual({ migrated: false });
    expect(listMailAccounts(s.db)).toHaveLength(1);
    expect(lines.join("\n")).not.toContain(PASSWORD);
  });

  it("creates the account and copies the password when none matches", () => {
    const s = setup(fakeServers({}));
    oldSetup(s, "owner@gmail.example.invalid");
    const r = s.mail.migrateAlertMailbox();
    expect(r).toMatchObject({ migrated: true, created: true });
    const a = getMailAccount(s.db, r.accountId!)!;
    expect(a).toMatchObject({
      address: "owner@gmail.example.invalid",
      host: "imap.gmail.com",
      jobAlerts: true,
      alertFolders: ["job-alerts"],
    });
    expect(readFileSync(join(s.secretsDir, "mail", String(a.id)), "utf8")).toBe(PASSWORD);
  });

  it("does nothing without the old password file", () => {
    const s = setup(fakeServers({}));
    updateSource(s.db, "email_alerts", { settings: { user: "owner@gmail.example.invalid" } });
    expect(s.mail.migrateAlertMailbox()).toEqual({ migrated: false });
    expect(listMailAccounts(s.db)).toEqual([]);
  });
});
