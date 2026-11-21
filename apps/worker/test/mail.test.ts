import { FakeLlmClient, LlmBudget, type ReplyClassification } from "@job-radar/core";
import {
  addInterview,
  applicationTimeline,
  createApplication,
  emailsForApplication,
  getApplication,
  getApplicationEmail,
  interviewsFor,
  listNotifications,
  llmUsageStore,
  moveStage,
  nextStepFor,
  setNextStep,
  transitionsFor,
  updateInterview,
  upsertCompany,
  upsertSource,
  insertOffer,
} from "@job-radar/db";
import type { ImapAccount, ReadOnlyImap } from "@job-radar/sources";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { setLogSink } from "../src/log";
import { MailService } from "../src/mail/service";
import { Notifier } from "../src/notifier";
import { testContext } from "./helpers";

// ---------- a fake, read-only IMAP server ----------

interface FakeMessage {
  uid: number;
  messageId?: string;
  from: { name?: string; address: string };
  subject: string;
  date: Date;
  text: string;
}

const ALLOWED = new Set([
  "connect",
  "mailboxOpen",
  "search",
  "fetch",
  "fetchOne",
  "logout",
  "close",
  "then", // checked by await
]);

/** Records every method the reader touches; anything outside ALLOWED fails the test. */
function fakeImap(
  folders: Record<string, { uidValidity: number; messages: FakeMessage[] }>,
  opts: { failLogin?: boolean } = {},
) {
  const touched = new Set<string>();
  const log: string[] = [];
  let open = "";
  const impl: ReadOnlyImap = {
    async connect() {
      if (opts.failLogin)
        throw Object.assign(new Error("Command failed"), { authenticationFailed: true });
    },
    async mailboxOpen(path, options) {
      if (!options.readOnly) throw new Error("must be read-only");
      const f = folders[path];
      if (!f)
        throw Object.assign(new Error("Command failed"), { serverResponseCode: "NONEXISTENT" });
      open = path;
      log.push(`EXAMINE ${path}`);
      return { uidValidity: BigInt(f.uidValidity), exists: f.messages.length };
    },
    async search(query) {
      const msgs = folders[open]!.messages;
      if (typeof query["uid"] === "string") {
        const from = Number(String(query["uid"]).split(":")[0]);
        const hits = msgs.filter((m) => m.uid >= from).map((m) => m.uid);
        // Like a real server, "n:*" returns the newest message even when it is below n.
        return hits.length ? hits : msgs.slice(-1).map((m) => m.uid);
      }
      const since = query["since"] as Date;
      return msgs.filter((m) => m.date >= since).map((m) => m.uid);
    },
    async *fetch(range) {
      for (const m of folders[open]!.messages.filter((x) => range.includes(x.uid))) {
        yield {
          uid: m.uid,
          envelope: {
            messageId: m.messageId,
            subject: m.subject,
            date: m.date,
            from: [{ name: m.from.name, address: m.from.address }],
          },
          internalDate: m.date,
        };
      }
    },
    async fetchOne(uid) {
      const m = folders[open]!.messages.find((x) => x.uid === Number(uid));
      if (!m) return false;
      log.push(`BODY ${uid}`);
      const raw = [
        `From: ${m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address}`,
        `Subject: ${m.subject}`,
        m.messageId ? `Message-ID: ${m.messageId}` : "",
        `Date: ${m.date.toUTCString()}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        m.text,
      ]
        .filter((l, i) => l !== "" || i > 3)
        .join("\r\n");
      return { source: Buffer.from(raw) };
    },
    async logout() {},
    close() {},
  };
  const client = new Proxy(impl, {
    get(target, prop, receiver) {
      if (typeof prop === "string") touched.add(prop);
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
  return { client, touched, log };
}

// ---------- setup ----------

const NOW = new Date("2026-11-20T10:00:00Z");
const PASSWORD = "abcd-efgh-ijkl-mnop";

function seedApplication(ctx: ReturnType<typeof testContext>, name: string, website: string) {
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby" });
  const company = upsertCompany(ctx.db, { name, normalizedName: name.toLowerCase(), website });
  const offer = insertOffer(ctx.db, {
    sourceId: "ashby",
    externalId: `x-${Math.random()}`,
    sourceUrl: "https://jobs.example.invalid/1",
    title: "Head of Engineering",
    normalizedTitle: "head of engineering",
    companyId: company.id,
    companyName: name,
  });
  return createApplication(ctx.db, { offerId: offer.id, at: new Date("2026-11-10T10:00:00Z") });
}

const invitation = (applicationId: number): ReplyClassification => ({
  application_id: applicationId,
  category: "interview_invitation",
  confidence: "high",
  summary: "Invites you to a screening call on 3 December at 16:00.",
  next_step: { description: "Confirm the screening call", due: "2026-11-25", time_zone: null },
  interview: {
    kind: "screening",
    scheduled_at: "2026-12-03T16:00",
    time_zone: "Europe/Madrid",
    link: "https://meet.example/abc",
  },
});

function setup(
  folders: Parameters<typeof fakeImap>[0],
  responses: unknown[] = [],
  opts: { cap?: number; failLogin?: boolean } = {},
) {
  const ctx = testContext();
  const secretsDir = mkdtempSync(join(tmpdir(), "job-radar-secrets-"));
  const notifier = new Notifier(ctx.db);
  const client = new FakeLlmClient(responses);
  const budget = new LlmBudget(llmUsageStore(ctx.db), () => ({
    scoring: opts.cap ?? 300,
    drafts: 30,
    research: 10,
  }));
  const imap = fakeImap(folders, opts);
  const connections: ImapAccount[] = [];
  const prepared: number[] = [];
  const mail = new MailService({
    db: ctx.db,
    profile: ctx.profile,
    notifier,
    llm: { client, budget },
    secretsDir,
    onInterviewStage: (id) => void prepared.push(id),
    connect: (a) => {
      connections.push(a);
      return imap.client;
    },
    now: () => NOW,
  });
  const app = createApp({ ...ctx, notifier, mail });
  return { ...ctx, mail, app, client, imap, secretsDir, connections, prepared, notifier };
}

function addAccount(s: ReturnType<typeof setup>, folders = ["INBOX"]) {
  return s.mail.createAccount(
    { label: "Personal", address: "owner@example.invalid", host: "imap.mail.me.com", folders },
    PASSWORD,
  );
}

const reply = (over: Partial<FakeMessage> = {}): FakeMessage => ({
  uid: 10,
  messageId: "<r1@northwind.example>",
  from: { name: "Ana at Northwind", address: "ana@northwind.example" },
  subject: "Next steps for Head of Engineering",
  date: new Date("2026-11-19T09:00:00Z"),
  text: "Hi! We'd love to schedule a screening call.\n\nOn Mon, owner wrote:\n> my application",
  ...over,
});

const logs: string[] = [];
afterEach(() => {
  logs.length = 0;
  setLogSink((line) => process.stderr.write(line + "\n"));
});

// ---------- accounts ----------

describe("mail accounts API", () => {
  it("stores the password only in secrets/mail, never returns or logs it, and removes it on delete", async () => {
    setLogSink((line) => void logs.push(line));
    const s = setup({ INBOX: { uidValidity: 1, messages: [] } });
    const created = await request(s.app)
      .post("/mail/accounts")
      .send({
        label: "iCloud",
        address: "owner@example.invalid",
        host: "imap.mail.me.com",
        password: PASSWORD,
      })
      .expect(201);
    expect(JSON.stringify(created.body)).not.toContain(PASSWORD);
    expect(created.body).toMatchObject({ hasPassword: true, folders: ["INBOX"], port: 993 });
    const file = join(s.secretsDir, "mail", String(created.body.id));
    expect(readFileSync(file, "utf8")).toBe(PASSWORD);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    const list = await request(s.app).get("/mail/accounts").expect(200);
    expect(JSON.stringify(list.body)).not.toContain(PASSWORD);
    const tested = await request(s.app).post(`/mail/accounts/${created.body.id}/test`).expect(200);
    expect(tested.body).toEqual({ ok: true, messages: 0 });
    expect(s.connections[0]).toMatchObject({
      host: "imap.mail.me.com",
      user: "owner@example.invalid",
    });

    await request(s.app).post("/mail/check").send({}).expect(200);
    expect(logs.join("\n")).not.toContain(PASSWORD);
    expect(logs.join("\n")).not.toContain("owner@example.invalid");

    await request(s.app).delete(`/mail/accounts/${created.body.id}`).expect(204);
    expect(existsSync(file)).toBe(false);
  });

  it("reports a rejected login with how to fix it, without stopping other accounts", async () => {
    const s = setup({ INBOX: { uidValidity: 1, messages: [] } }, [], { failLogin: true });
    const a = addAccount(s);
    const res = await s.mail.testAccount(a.id);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("app-specific password");
    expect(s.mail.listAccounts()[0]).toMatchObject({ status: "failed" });
  });

  it("rejects a host with a scheme or path", async () => {
    const s = setup({});
    await request(s.app)
      .post("/mail/accounts")
      .send({ label: "x", address: "a@b.c", host: "https://imap.x.com/" })
      .expect(400);
  });
});

// ---------- reading ----------

describe("reading mailboxes", () => {
  it("uses only read-only commands and fetches bodies only for matches", async () => {
    const s = setup(
      {
        INBOX: {
          uidValidity: 7,
          messages: [
            reply(),
            reply({
              uid: 11,
              messageId: "<n@x>",
              from: { address: "news@substack.com" },
              subject: "Weekly",
            }),
          ],
        },
      },
      [],
      { cap: 0 },
    );
    seedApplication(s, "Northwind", "https://northwind.example");
    addAccount(s);
    const sum = await s.mail.check();
    expect(sum).toMatchObject({ accounts: 1, failed: 0, scanned: 2, matched: 1, queued: 1 });
    expect([...s.imap.touched].every((p) => ALLOWED.has(p))).toBe(true);
    expect(s.imap.log).toEqual(["EXAMINE INBOX", "BODY 10"]);
    // The newsletter was never stored.
    expect(getApplicationEmail(s.db, 2)).toBeUndefined();
    // The cap was 0: the match waits, with its cleaned body, as "queued".
    const queued = getApplicationEmail(s.db, 1);
    expect(queued?.status).toBe("queued");
    expect(queued?.pendingBody).toBe("Hi! We'd love to schedule a screening call.");
  });

  it("continues after the cursor and re-reads without duplicates after a UIDVALIDITY change", async () => {
    const folders = { INBOX: { uidValidity: 7, messages: [reply()] } };
    const s = setup(folders, [], { cap: 0 });
    seedApplication(s, "Northwind", "https://northwind.example");
    addAccount(s);
    await s.mail.check();
    s.imap.log.length = 0;
    await s.mail.check();
    expect(s.imap.log).toEqual(["EXAMINE INBOX"]); // nothing new after uid 10
    folders.INBOX.uidValidity = 8;
    s.imap.log.length = 0;
    const again = await s.mail.check();
    expect(again.matched).toBe(0);
    expect(s.imap.log).toEqual(["EXAMINE INBOX"]); // known Message-ID: no body fetched
  });

  it("a failing account does not stop the others", async () => {
    const s = setup({ INBOX: { uidValidity: 1, messages: [] } }, [], { cap: 0 });
    addAccount(s, ["Missing"]);
    addAccount(s, ["INBOX"]);
    const sum = await s.mail.check();
    expect(sum).toMatchObject({ accounts: 2, failed: 1 });
    const [bad, good] = s.mail.listAccounts();
    expect(bad?.lastError).toContain('Folder "Missing" does not exist');
    expect(good?.status).toBe("ok");
  });
});

// ---------- processing ----------

describe("processing replies", () => {
  it("applies a clear interview invitation: stage, interview, next step, prep and a notification", async () => {
    const s = setup({ INBOX: { uidValidity: 7, messages: [reply()] } });
    const app = seedApplication(s, "Northwind", "https://northwind.example");
    s.client.push(invitation(app.id));
    addAccount(s);
    await s.mail.check();
    const after = getApplication(s.db, app.id);
    expect(after?.stage).toBe("screening_call");
    expect(after?.firstResponseAt).toEqual(NOW);
    const t = transitionsFor(s.db, app.id).at(-1);
    expect(t).toMatchObject({ toStage: "screening_call", source: "email", note: "From email" });
    const [iv] = interviewsFor(s.db, app.id);
    expect(iv).toMatchObject({
      type: "screening",
      timeZone: "Europe/Madrid",
      link: "https://meet.example/abc",
    });
    expect(iv?.scheduledAt.toISOString()).toBe("2026-12-03T15:00:00.000Z");
    expect(nextStepFor(s.db, app.id)?.description).toBe("Confirm the screening call");
    expect(s.prepared).toEqual([app.id]);
    const [n] = listNotifications(s.db);
    expect(n).toMatchObject({ kind: "email_next_step", applicationId: app.id });
    expect(n?.body).toContain("Moved to Screening call.");
    expect(emailsForApplication(s.db, app.id)[0]).toMatchObject({
      status: "auto_applied",
      pendingBody: null,
    });
    expect(applicationTimeline(s.db, app.id).some((e) => e.kind === "email")).toBe(true);
    // The model saw the cleaned body as untrusted data and only this candidate.
    expect(s.client.requests[0]?.prompt).toContain(
      `- id ${app.id}: Head of Engineering at Northwind`,
    );
    expect(s.client.requests[0]?.prompt).not.toContain("my application");
  });

  it("a rejection closes the application and marks the pending next step done", async () => {
    const s = setup({ INBOX: { uidValidity: 7, messages: [reply({ subject: "Update" })] } });
    const app = seedApplication(s, "Northwind", "https://northwind.example");
    moveStage(s.db, app.id, "technical_interview");
    setNextStep(s.db, app.id, { description: "Prepare system design", dueAt: null });
    s.client.push({
      application_id: app.id,
      category: "rejection",
      confidence: "high",
      summary: "They decided not to move forward.",
      next_step: null,
      interview: null,
    });
    addAccount(s);
    await s.mail.check();
    expect(getApplication(s.db, app.id)?.stage).toBe("rejected");
    expect(nextStepFor(s.db, app.id)?.doneAt).not.toBeNull();
    expect(listNotifications(s.db)[0]?.kind).toBe("email_rejection");
  });

  it("an acknowledgement only goes to the timeline", async () => {
    const s = setup({
      INBOX: { uidValidity: 7, messages: [reply({ subject: "We received your application" })] },
    });
    const app = seedApplication(s, "Northwind", "https://northwind.example");
    s.client.push({
      application_id: app.id,
      category: "acknowledgement",
      confidence: "high",
      summary: "Automatic confirmation that the application arrived.",
      next_step: null,
      interview: null,
    });
    addAccount(s);
    await s.mail.check();
    const after = getApplication(s.db, app.id);
    expect(after).toMatchObject({ stage: "applied", firstResponseAt: null });
    expect(after?.lastActivityAt).toEqual(app.lastActivityAt);
    expect(listNotifications(s.db)).toHaveLength(0);
    expect(emailsForApplication(s.db, app.id)[0]?.status).toBe("timeline_only");
  });

  it("waits at the cap and classifies the next day in arrival order", async () => {
    const s = setup(
      {
        INBOX: {
          uidValidity: 7,
          messages: [
            reply({ uid: 10, messageId: "<a@x>" }),
            reply({ uid: 11, messageId: "<b@x>", date: new Date("2026-11-19T11:00:00Z") }),
          ],
        },
      },
      [],
      { cap: 0 },
    );
    seedApplication(s, "Northwind", "https://northwind.example");
    addAccount(s);
    const first = await s.mail.check();
    expect(first).toMatchObject({ matched: 2, classified: 0, queued: 2 });
    expect(s.client.requests).toHaveLength(0);
  });

  it("an ambiguous reply becomes a suggestion that the owner applies to the right application", async () => {
    const s = setup({ INBOX: { uidValidity: 7, messages: [reply()] } });
    const a1 = seedApplication(s, "Northwind", "https://northwind.example");
    const a2 = seedApplication(s, "Northwind", "https://northwind.example");
    s.client.push({ ...invitation(a1.id), application_id: null, confidence: "medium" });
    addAccount(s);
    await s.mail.check();
    const email = getApplicationEmail(s.db, 1)!;
    expect(email.status).toBe("suggested");
    expect([...email.candidates].sort()).toEqual([a1.id, a2.id]);
    expect(listNotifications(s.db)[0]?.title).toMatch(/^Suggested: interview invitation/);
    const pick = await request(s.app).post(`/mail/emails/${email.id}/apply`).send({}).expect(400);
    expect(pick.body.error).toBe("Pick the application this email is about");
    await request(s.app)
      .post(`/mail/emails/${email.id}/apply`)
      .send({ applicationId: a1.id })
      .expect(200);
    expect(getApplication(s.db, a1.id)?.stage).toBe("screening_call");
    expect(getApplication(s.db, a2.id)?.stage).toBe("applied");
    await request(s.app)
      .post(`/mail/emails/${email.id}/apply`)
      .send({ applicationId: a1.id })
      .expect(409);
  });
});

// ---------- undo ----------

describe("undo", () => {
  async function applied() {
    const s = setup({ INBOX: { uidValidity: 7, messages: [reply()] } });
    const app = seedApplication(s, "Northwind", "https://northwind.example");
    setNextStep(s.db, app.id, { description: "Wait for news", dueAt: null });
    s.client.push(invitation(app.id));
    addAccount(s);
    await s.mail.check();
    return { s, app };
  }

  it("restores stage, next step and first response, removes the interview, and is a no-op twice", async () => {
    const { s, app } = await applied();
    const res = await request(s.app).post("/mail/emails/1/undo").expect(200);
    expect(res.body).toMatchObject({ ok: true, message: "Undone" });
    const after = getApplication(s.db, app.id);
    expect(after).toMatchObject({ stage: "applied", firstResponseAt: null });
    expect(interviewsFor(s.db, app.id)).toHaveLength(0);
    expect(nextStepFor(s.db, app.id)?.description).toBe("Wait for news");
    expect(getApplicationEmail(s.db, 1)?.status).toBe("undone");
    const again = await request(s.app).post("/mail/emails/1/undo").expect(409);
    expect(again.body.message).toBe("Already undone");
  });

  it("after a manual change, only reverts what is unchanged and says what it kept", async () => {
    const { s, app } = await applied();
    moveStage(s.db, app.id, "technical_interview");
    const [iv] = interviewsFor(s.db, app.id);
    updateInterview(s.db, iv!.id, { scheduledAt: new Date("2026-12-04T15:00:00Z") });
    addInterview(s.db, app.id, {
      type: "technical",
      scheduledAt: new Date("2026-12-10T10:00:00Z"),
      timeZone: "UTC",
    });
    const res = s.mail.undo(1);
    expect(res.message).toBe(
      "Undone, except the stage (it was changed after the email) and the interview (it was edited)",
    );
    expect(getApplication(s.db, app.id)?.stage).toBe("technical_interview");
    expect(interviewsFor(s.db, app.id)).toHaveLength(2);
    expect(nextStepFor(s.db, app.id)?.description).toBe("Wait for news");
  });
});

// ---------- schedule ----------

describe("schedule", () => {
  it("tick() checks only when mail.check_minutes have passed", async () => {
    let now = NOW;
    const s = setup({ INBOX: { uidValidity: 1, messages: [] } }, [], { cap: 0 });
    const mail = new MailService({
      db: s.db,
      profile: s.profile,
      llm: {
        client: s.client,
        budget: new LlmBudget(llmUsageStore(s.db), () => ({ scoring: 0, drafts: 0, research: 0 })),
      },
      secretsDir: s.secretsDir,
      connect: () => s.imap.client,
      now: () => now,
    });
    addAccount(s);
    mail.tick();
    await mail.idle();
    expect(s.imap.log).toHaveLength(1);
    now = new Date(NOW.getTime() + 14 * 60_000);
    mail.tick();
    await mail.idle();
    expect(s.imap.log).toHaveLength(1);
    now = new Date(NOW.getTime() + 15 * 60_000);
    mail.tick();
    await mail.idle();
    expect(s.imap.log).toHaveLength(2);
  });
});
