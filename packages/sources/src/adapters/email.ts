// Job-alert emails (design D5): one read-only mailbox label that receives alerts from
// LinkedIn, Upwork, Malt and Wellfound. Recommended path for sites that restrict automation.
import {
  UNTRUSTED_DATA_RULES,
  callStructured,
  parseCompensation,
  wrapUntrusted,
  type NormalizedOfferInput,
} from "@job-radar/core";
import * as cheerio from "cheerio";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { z } from "zod";
import type { SourceAdapter, SourceContext } from "../types";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom } from "../util";

export interface AlertEmail {
  messageId: string;
  from: string;
  subject: string;
  date: Date | null;
  html: string | null;
  text: string | null;
}

interface SiteRule {
  site: string;
  sender: RegExp;
  /** Job URL pattern; group 1 is the job id. */
  jobUrl: RegExp;
  engagementHint?: string;
}

export const SITE_RULES: SiteRule[] = [
  {
    site: "linkedin",
    sender: /linkedin\.com/i,
    jobUrl: /https?:\/\/(?:www\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i,
  },
  {
    site: "upwork",
    sender: /upwork\.com/i,
    jobUrl:
      /https?:\/\/(?:www\.)?upwork\.com\/(?:jobs|freelance-jobs\/apply)\/[^\s"'<>?]*?(~[0-9a-z]+)/i,
    engagementHint: "freelance",
  },
  {
    site: "malt",
    sender: /malt\.(?:fr|es|com|de|co\.uk|nl|be)/i,
    jobUrl:
      /https?:\/\/(?:www\.)?malt\.(?:fr|es|com|de|co\.uk|nl|be)\/[^\s"'<>?]*?(?:project|projects|mission|offer)s?\/([0-9a-z-]+)/i,
    engagementHint: "freelance",
  },
  {
    site: "wellfound",
    sender: /wellfound\.com|angel\.co/i,
    jobUrl: /https?:\/\/(?:www\.)?wellfound\.com\/(?:company\/[^/\s"']+\/)?jobs\/(\d+)[^\s"'<>?]*/i,
  },
];

const NOISE =
  /^(view job|view|apply|apply now|see job|see more|save|easy apply|new|promoted|actively recruiting|be an early applicant)$/i;

function cleanUrl(url: string): string {
  return (url.split("?")[0] ?? url).replace(/&amp;$/, "");
}

/** Parses one alert email with the sender's rule. Returns [] when nothing matches. */
export function parseWithRule(
  email: AlertEmail,
  rule: SiteRule,
  sourceId = "email_alerts",
): NormalizedOfferInput[] {
  const jobs = new Map<string, { url: string; title: string; lines: string[] }>();
  if (email.html) {
    const $ = cheerio.load(email.html);
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      const m = rule.jobUrl.exec(href);
      if (!m?.[1]) return;
      const id = m[1];
      const text = $(a).text().replace(/\s+/g, " ").trim();
      const block = $(a).closest("td, li, div, tr");
      const lines = block
        .text()
        .split(/\n+/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l && !NOISE.test(l));
      const existing = jobs.get(id);
      const title =
        text && !NOISE.test(text) && text.length > (existing?.title.length ?? 0)
          ? text
          : (existing?.title ?? "");
      jobs.set(id, {
        url: cleanUrl(m[0]),
        title,
        lines: existing && existing.lines.length >= lines.length ? existing.lines : lines,
      });
    });
  } else if (email.text) {
    const lines = email.text.split(/\r?\n/).map((l) => l.trim());
    lines.forEach((line, i) => {
      const m = rule.jobUrl.exec(line);
      if (!m?.[1] || jobs.has(m[1])) return;
      const before: string[] = [];
      for (let j = i - 1; j >= 0 && before.length < 4; j--) {
        const l = (lines[j] ?? "").replace(/^(view job|apply)\s*:?\s*$/i, "");
        if (!l) {
          if (before.length) break;
          continue;
        }
        if (rule.jobUrl.test(l)) break;
        before.unshift(l);
      }
      jobs.set(m[1], { url: cleanUrl(m[0]), title: before[0] ?? "", lines: before });
    });
  }
  const out: NormalizedOfferInput[] = [];
  for (const [id, job] of jobs) {
    if (!job.title) continue;
    const rest = job.lines.filter((l) => l !== job.title);
    // Typical card: title, company, location (in that order), then extras like budget.
    const companyLine =
      rest.find((l) => !/remote|hybrid|on-?site|\$|€|£|budget|posted|hour|fixed/i.test(l)) ?? "";
    const company = companyLine.split(/\s+[·•|-]\s+/)[0]?.trim() || "Unknown company";
    const location =
      rest.find(
        (l) =>
          l !== companyLine &&
          /remote|hybrid|on-?site|,|europe|emea|spain|united|worldwide|anywhere/i.test(l),
      ) ?? null;
    const extras = rest.join(" \n ");
    out.push({
      sourceId,
      externalId: `${rule.site}:${id}`,
      sourceUrl: job.url,
      title: job.title,
      companyName: company,
      location,
      remotePolicy: inferRemotePolicy(location, extras),
      regions: regionsFrom(location),
      engagementType: inferEngagement(rule.engagementHint, extras, job.title),
      compensation: parseCompensation(extras),
      postedAt: email.date,
      description: [job.title, ...rest].join("\n"),
      applyMethod: `${rule.site} (open manually)`,
      applyUrl: job.url,
      companyMeta: { via: `${rule.site} alert`, email_subject: email.subject },
      raw: { site: rule.site, lines: job.lines, messageId: email.messageId },
    });
  }
  return out;
}

const llmJobsSchema = z
  .object({
    jobs: z
      .array(
        z
          .object({
            title: z.string().max(200),
            company: z.string().max(120),
            location: z.string().max(200).nullable(),
            url: z.string().max(500),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

/** LLM fallback for unknown senders or changed layouts. URLs must appear in the email. */
export async function parseWithLlm(
  email: AlertEmail,
  ctx: SourceContext,
): Promise<NormalizedOfferInput[]> {
  if (!ctx.llm) return [];
  const text = (email.html ? htmlToText(email.html) : (email.text ?? "")).slice(0, 8000);
  const links = new Set(
    [...(email.html ?? email.text ?? "").matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) =>
      cleanUrl(m[0]),
    ),
  );
  const res = await callStructured(
    { client: ctx.llm.client, budget: ctx.llm.budget },
    {
      kind: "extraction",
      model: ctx.llm.model,
      system: `List the job offers announced in this job-alert email. Use only URLs that appear in the email.\n${UNTRUSTED_DATA_RULES}`,
      prompt: `Subject: ${email.subject}\nLinks in the email:\n${[...links].slice(0, 60).join("\n")}\n\n${wrapUntrusted("email", text)}`,
      schema: llmJobsSchema,
      schemaName: "alert_jobs",
    },
  );
  return res.value.jobs
    .filter((j) => links.has(cleanUrl(j.url)))
    .map((j) => ({
      sourceId: ctx.sourceId,
      externalId: `email:${cleanUrl(j.url)}`,
      sourceUrl: cleanUrl(j.url),
      title: j.title,
      companyName: j.company || "Unknown company",
      location: j.location,
      remotePolicy: inferRemotePolicy(j.location),
      regions: regionsFrom(j.location),
      engagementType: inferEngagement(j.title),
      postedAt: email.date,
      description: j.title,
      applyMethod: "open manually",
      applyUrl: cleanUrl(j.url),
      companyMeta: { via: "email alert (LLM extraction)", email_subject: email.subject },
      raw: { messageId: email.messageId, extracted: j },
    }));
}

export async function parseAlertEmail(
  email: AlertEmail,
  ctx: SourceContext,
): Promise<NormalizedOfferInput[]> {
  const rule = SITE_RULES.find((r) => r.sender.test(email.from));
  const parsed = rule ? parseWithRule(email, rule, ctx.sourceId) : [];
  if (parsed.length) return parsed;
  ctx.log(
    `No parser match for "${email.subject}" from ${email.from}; ${ctx.llm ? "using LLM extraction" : "skipped (LLM unavailable)"}`,
  );
  return parseWithLlm(email, ctx).catch((err: unknown) => {
    ctx.log(`LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  });
}

export async function emailFromSource(source: Buffer | string): Promise<AlertEmail> {
  const mail = await simpleParser(source);
  return {
    messageId: mail.messageId ?? `${mail.date?.toISOString() ?? ""}:${mail.subject ?? ""}`,
    from: mail.from?.text ?? "",
    subject: mail.subject ?? "",
    date: mail.date ?? null,
    html: typeof mail.html === "string" ? mail.html : null,
    text: mail.text ?? null,
  };
}

/** imapflow throws "Command failed"; turn its server response into an actionable message. */
export function describeImapError(err: unknown, label: string): Error {
  const e = (err ?? {}) as {
    message?: string;
    responseText?: string;
    serverResponseCode?: string;
    authenticationFailed?: boolean;
  };
  if (e.authenticationFailed || e.serverResponseCode === "AUTHENTICATIONFAILED") {
    return new Error(
      "Gmail rejected the login: check the mailbox address in Settings and the app password in secrets/imap_app_password",
    );
  }
  if (e.serverResponseCode === "NONEXISTENT") {
    return new Error(
      `Gmail has no label "${label}": create it in Gmail (and a filter that applies it) or change the label in Settings`,
    );
  }
  const detail = [e.serverResponseCode, e.responseText].filter(Boolean).join(" ");
  return new Error(detail ? `IMAP error: ${detail}` : (e.message ?? String(err)));
}

export const emailAlertsAdapter: SourceAdapter = {
  type: "email_alerts",
  label: "Job-alert emails (IMAP label)",
  defaultIntervalMinutes: 60,
  async fetchOffers(ctx) {
    const s = ctx.settings;
    const user = typeof s["user"] === "string" ? s["user"] : null;
    const password = ctx.readSecret?.("imap_app_password") ?? null;
    if (!user || !password) {
      throw new Error(
        "Set the mailbox address in Settings and save the app password to secrets/imap_app_password",
      );
    }
    const label = typeof s["label"] === "string" ? s["label"] : "job-alerts";
    const lookbackDays = typeof s["lookback_days"] === "number" ? s["lookback_days"] : 3;
    const client = new ImapFlow({
      host: typeof s["host"] === "string" ? s["host"] : "imap.gmail.com",
      port: typeof s["port"] === "number" ? s["port"] : 993,
      secure: true,
      auth: { user, pass: password },
      logger: false,
    });
    const out: NormalizedOfferInput[] = [];
    try {
      await client.connect();
      // EXAMINE (read-only): messages are never marked as read, moved or deleted.
      await client.mailboxOpen(label, { readOnly: true });
      const since = new Date(ctx.now().getTime() - lookbackDays * 86_400_000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      ctx.log(`${label}: ${uids.length} messages since ${since.toISOString().slice(0, 10)}`);
      for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
        if (!msg.source) continue;
        out.push(...(await parseAlertEmail(await emailFromSource(msg.source), ctx)));
      }
    } catch (err) {
      throw describeImapError(err, label);
    } finally {
      await client.logout().catch(() => {});
    }
    return out;
  },
};
