import { FakeLlmClient } from "@job-radar/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emailAlertsAdapter, emailFromSource, parseAlertEmail } from "../src/adapters/email";
import type { AlertEmail, AlertFolderRead, AlertMailbox, MailConnector } from "../src/types";
import { assertNormalized, fixtureContext } from "./helpers";

const eml = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", "email", `${name}.eml`));

async function parse(name: string, llm?: FakeLlmClient) {
  const ctx = fixtureContext(
    {},
    { sourceId: "email_alerts", llm: llm ? { client: llm, model: "haiku" } : undefined },
  );
  const offers = await parseAlertEmail(await emailFromSource(eml(name)), ctx);
  assertNormalized(offers);
  return { offers, ctx };
}

describe("job-alert email parsers (.eml fixtures)", () => {
  it("LinkedIn: one offer per job id with title, company and location", async () => {
    const { offers } = await parse("linkedin");
    expect(offers.map((o) => [o.externalId, o.title, o.companyName, o.location])).toEqual([
      [
        "linkedin:4012345678",
        "Senior AI Engineer (LLM, RAG)",
        "Northwind Analytics",
        "European Union (Remote)",
      ],
      [
        "linkedin:4087654321",
        "Head of Engineering",
        "Contoso Labs",
        "Madrid, Community of Madrid, Spain (Hybrid)",
      ],
    ]);
    expect(offers[0]!.sourceUrl).toBe("https://www.linkedin.com/comm/jobs/view/4012345678");
    expect(offers[1]!.remotePolicy).toBe("hybrid");
  });

  it("Upwork: plain-text alerts with hourly and fixed budgets", async () => {
    const { offers } = await parse("upwork");
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: "upwork:~021234567890abcdef",
      title: "Build agentic RAG assistant for legal documents",
      engagementType: "freelance",
      compensation: { min: 6000, max: 9000, currency: "USD", period: "hour" },
    });
    expect(offers[1]!.compensation).toMatchObject({
      min: 400_000,
      currency: "USD",
      period: "project",
    });
  });

  it("Malt: day rate in EUR", async () => {
    const { offers } = await parse("malt");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      title: "Lead developer IA generativa (RAG)",
      companyName: "Fabrikam Seguros",
      remotePolicy: "remote",
      engagementType: "freelance",
      compensation: { min: 60_000, currency: "EUR", period: "day" },
    });
  });

  it("Wellfound: startup job with salary", async () => {
    const { offers } = await parse("wellfound");
    expect(offers[0]).toMatchObject({
      externalId: "wellfound:3456789",
      title: "Founding Full-Stack Engineer",
      companyName: "Tailspin AI",
      regions: ["Europe"],
      compensation: { min: 7_000_000, max: 9_500_000, currency: "EUR" },
    });
  });

  it("Greenhouse: board-qualified ids, company from the card or the board", async () => {
    const { offers } = await parse("greenhouse");
    expect(offers.map((o) => [o.externalId, o.title, o.companyName, o.sourceUrl])).toEqual([
      [
        "greenhouse:northwindlabs:7012345678",
        "Staff AI Engineer",
        "Northwind Labs",
        "https://job-boards.greenhouse.io/northwindlabs/jobs/7012345678",
      ],
      [
        "greenhouse:contoso-ai:4401122",
        "Engineering Manager, Platform",
        "Contoso Ai",
        "https://job-boards.eu.greenhouse.io/contoso-ai/jobs/4401122",
      ],
    ]);
    expect(offers[0]!.remotePolicy).toBe("remote");
  });

  it("unknown sender: LLM fallback keeps only URLs present in the email", async () => {
    const llm = new FakeLlmClient([
      {
        jobs: [
          {
            title: "Staff TypeScript Engineer",
            company: "Adatum",
            location: "Remote EU",
            url: "https://jobs.example.invalid/adatum/123",
          },
          {
            title: "Invented job",
            company: "Nowhere",
            location: null,
            url: "https://evil.example.invalid/phish",
          },
        ],
      },
    ]);
    const { offers, ctx } = await parse("unknown", llm);
    expect(offers.map((o) => o.title)).toEqual(["Staff TypeScript Engineer"]);
    expect(llm.requests[0]?.kind).toBe("extraction");
    expect(llm.requests[0]?.prompt).toContain('<untrusted name="email">');
    expect(ctx.logs[0]).toMatch(/No parser match .* using LLM extraction/);
  });
});

// A fake of the worker's connector: folders hold .eml fixtures; it records what it downloaded.
function fakeMail(
  accounts: AlertMailbox[],
  folders: Record<string, Record<string, string[]>>,
  failing: number[] = [],
) {
  const downloaded: string[] = [];
  const mail: MailConnector = {
    accounts: () => accounts,
    async read(account, requests) {
      if (failing.includes(account.id)) throw new Error("imap.example rejected the login");
      const out: AlertFolderRead[] = [];
      for (const r of requests) {
        const names = folders[account.label]?.[r.folder];
        if (!names) {
          out.push({ folder: r.folder, emails: [], error: `Folder "${r.folder}" does not exist` });
          continue;
        }
        const emails: AlertEmail[] = [];
        for (const name of names) {
          const e = await emailFromSource(eml(name));
          const fromAddress = /<([^>]+)>/.exec(e.from)?.[1] ?? e.from;
          if (!r.accept({ fromAddress, fromName: null, subject: e.subject })) continue;
          downloaded.push(`${account.label}/${r.folder}/${name}`);
          emails.push(e);
        }
        out.push({ folder: r.folder, emails });
      }
      return out;
    },
  };
  return { mail, downloaded };
}

const GMAIL: AlertMailbox = {
  id: 1,
  label: "Gmail",
  folders: [{ name: "job-alerts", knownSendersOnly: false }],
};
const ICLOUD: AlertMailbox = {
  id: 2,
  label: "iCloud",
  folders: [{ name: "INBOX", knownSendersOnly: true }],
};

describe("job-alert source over the email accounts", () => {
  it("reads alerts from two accounts; INBOX downloads only known alert senders", async () => {
    const llm = new FakeLlmClient([]);
    const { mail, downloaded } = fakeMail([GMAIL, ICLOUD], {
      Gmail: { "job-alerts": ["linkedin"] },
      iCloud: { INBOX: ["greenhouse", "personal"] },
    });
    const ctx = fixtureContext(
      {},
      { sourceId: "email_alerts", mail, llm: { client: llm, model: "haiku" } },
    );
    const offers = await emailAlertsAdapter.fetchOffers(ctx);
    assertNormalized(offers);
    expect(offers.map((o) => o.externalId)).toEqual([
      "linkedin:4012345678",
      "linkedin:4087654321",
      "greenhouse:northwindlabs:7012345678",
      "greenhouse:contoso-ai:4401122",
    ]);
    expect(downloaded).toEqual(["Gmail/job-alerts/linkedin", "iCloud/INBOX/greenhouse"]);
    expect(llm.requests).toHaveLength(0);
  });

  it("an unknown sender in INBOX is never sent to the model", async () => {
    const llm = new FakeLlmClient([]);
    const inboxAll: AlertMailbox = {
      ...ICLOUD,
      folders: [{ name: "INBOX", knownSendersOnly: true }],
    };
    const { mail, downloaded } = fakeMail([inboxAll], { iCloud: { INBOX: ["unknown"] } });
    const ctx = fixtureContext({}, { mail, llm: { client: llm, model: "haiku" } });
    expect(await emailAlertsAdapter.fetchOffers(ctx)).toEqual([]);
    expect(downloaded).toEqual([]);
    expect(llm.requests).toHaveLength(0);
  });

  it("one account failing: the others are read and the run reports the failed one", async () => {
    const { mail } = fakeMail([GMAIL, ICLOUD], { Gmail: { "job-alerts": ["wellfound"] } }, [2]);
    const errors: string[] = [];
    const ctx = fixtureContext({}, { mail, reportError: (m: string) => errors.push(m) });
    const offers = await emailAlertsAdapter.fetchOffers(ctx);
    expect(offers.map((o) => o.externalId)).toEqual(["wellfound:3456789"]);
    expect(errors).toEqual(["iCloud: imap.example rejected the login"]);
  });

  it("a missing alert folder is reported with the account and folder", async () => {
    const { mail } = fakeMail([GMAIL], { Gmail: {} });
    const errors: string[] = [];
    const ctx = fixtureContext({}, { mail, reportError: (m: string) => errors.push(m) });
    expect(await emailAlertsAdapter.fetchOffers(ctx)).toEqual([]);
    expect(errors).toEqual(['Gmail / job-alerts: Folder "job-alerts" does not exist']);
  });

  it("fails when every account fails, or when no account has alerts on", async () => {
    const { mail } = fakeMail([GMAIL], {}, [1]);
    await expect(emailAlertsAdapter.fetchOffers(fixtureContext({}, { mail }))).rejects.toThrow(
      "Gmail: imap.example rejected the login",
    );
    const none = fakeMail([], {}).mail;
    await expect(
      emailAlertsAdapter.fetchOffers(fixtureContext({}, { mail: none })),
    ).rejects.toThrow(/Settings → Email/);
  });
});
