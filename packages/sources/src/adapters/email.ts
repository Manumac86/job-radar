// Job-alert emails (design D5, job-alert-mailboxes): alerts from LinkedIn, Upwork, Malt,
// Wellfound and Greenhouse, read from the owner's email accounts. Recommended path for sites
// that restrict automation.
import {
  UNTRUSTED_DATA_RULES,
  callStructured,
  parseCompensation,
  wrapUntrusted,
  type NormalizedOfferInput,
} from "@job-radar/core";
import * as cheerio from "cheerio";
import { simpleParser } from "mailparser";
import { z } from "zod";
import type { AlertEmail, SourceAdapter, SourceContext } from "../types";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom } from "../util";

export type { AlertEmail };

interface SiteRule {
  site: string;
  sender: RegExp;
  /** Job URL pattern; group 1 is the job id, or the board when group 2 (the job id) exists. */
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
  {
    // Greenhouse and MyGreenhouse job alerts link to the public job board page
    // (job-boards[.eu].greenhouse.io/<board>/jobs/<id>, or the older boards.greenhouse.io).
    site: "greenhouse",
    sender: /greenhouse\.io|greenhouse-mail\.io|greenhouse\.com/i,
    jobUrl:
      /https?:\/\/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(?!embed\b)([\w-]+)\/jobs\/(\d+)/i,
  },
];

/** The job id from a rule match: "<board>:<id>" when the rule captures a board too. */
function jobIdOf(m: RegExpExecArray): string | null {
  if (!m[1]) return null;
  return m[2] ? `${m[1]}:${m[2]}` : m[1];
}

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
      const id = m ? jobIdOf(m) : null;
      if (!m || !id) return;
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
      const id = m ? jobIdOf(m) : null;
      if (!m || !id || jobs.has(id)) return;
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
      jobs.set(id, { url: cleanUrl(m[0]), title: before[0] ?? "", lines: before });
    });
  }
  const out: NormalizedOfferInput[] = [];
  for (const [id, job] of jobs) {
    if (!job.title) continue;
    const rest = job.lines.filter((l) => l !== job.title);
    // Typical card: title, company, location (in that order), then extras like budget.
    const companyLine =
      rest.find((l) => !/remote|hybrid|on-?site|\$|€|£|budget|posted|hour|fixed/i.test(l)) ?? "";
    // A board-qualified id ("<board>:<id>") names the company when the card does not.
    const board = id.includes(":") ? (id.split(":")[0] ?? "") : "";
    const company =
      companyLine.split(/\s+[·•|-]\s+/)[0]?.trim() ||
      (board ? board.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "") ||
      "Unknown company";
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

/** True when the sender is a known job-alert sender (LinkedIn, Upwork, Malt, Wellfound, Greenhouse). */
export function isKnownAlertSender(fromAddress: string): boolean {
  return SITE_RULES.some((r) => r.sender.test(fromAddress));
}

/** Known senders only, no model fallback: used for INBOX (job-alert-mailboxes D3). */
export function parseKnownSender(email: AlertEmail, sourceId: string): NormalizedOfferInput[] {
  const rule = SITE_RULES.find((r) => r.sender.test(email.from));
  return rule ? parseWithRule(email, rule, sourceId) : [];
}

export const emailAlertsAdapter: SourceAdapter = {
  type: "email_alerts",
  label: "Job-alert emails",
  defaultIntervalMinutes: 60,
  async fetchOffers(ctx) {
    const mail = ctx.mail;
    if (!mail)
      throw new Error("Job-alert emails are read from your email accounts (Settings → Email)");
    const accounts = mail.accounts();
    if (!accounts.length) {
      throw new Error(
        "No email account has job alerts on: turn them on for an account in Settings → Email",
      );
    }
    const s = ctx.settings;
    const lookbackDays = typeof s["lookback_days"] === "number" ? s["lookback_days"] : 3;
    const since = new Date(ctx.now().getTime() - lookbackDays * 86_400_000);
    const out: NormalizedOfferInput[] = [];
    const errors: string[] = [];
    let accountsRead = 0;
    for (const account of accounts) {
      const knownOnly = new Map(account.folders.map((f) => [f.name, f.knownSendersOnly]));
      try {
        const reads = await mail.read(
          account,
          account.folders.map((f) => ({
            folder: f.name,
            // INBOX: only known alert senders are downloaded; personal mail is never read.
            accept: f.knownSendersOnly ? (e) => isKnownAlertSender(e.fromAddress) : () => true,
          })),
          since,
        );
        accountsRead++;
        for (const r of reads) {
          if (r.error) {
            errors.push(`${account.label} / ${r.folder}: ${r.error}`);
            continue;
          }
          ctx.log(`${account.label} / ${r.folder}: ${r.emails.length} new messages`);
          for (const email of r.emails) {
            out.push(
              ...(knownOnly.get(r.folder)
                ? parseKnownSender(email, ctx.sourceId)
                : await parseAlertEmail(email, ctx)),
            );
          }
        }
      } catch (err) {
        errors.push(`${account.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Every account failed: the run fails. Otherwise the run succeeds and shows what failed.
    if (!accountsRead) throw new Error(errors.join("; "));
    if (errors.length) ctx.reportError?.(errors.join("; "));
    return out;
  },
};
