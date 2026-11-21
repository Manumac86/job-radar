// Local prefilter for replies (application-emails D3). Runs on headers only: a message that
// doesn't match never leaves the machine.
import { normalizeCompany } from "../offers/normalize";

/** Hiring platforms that send mail on a company's behalf (sender domain suffixes). */
export const HIRING_SENDERS: readonly string[] = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "ashbyhq.com",
  "workablemail.com",
  "workable.com",
  "smartrecruiters.com",
  "myworkday.com",
  "workday.com",
  "teamtailor-mail.com",
  "teamtailor.com",
  "recruitee.com",
  "personio.de",
  "personio.com",
  "bamboohr.com",
  "jobvite.com",
  "icims.com",
  "breezy.hr",
  "homerun.co",
  "join.com",
  "linkedin.com",
  "wellfound.com",
  "malt.com",
  "malt.fr",
  "malt.es",
  "upwork.com",
  "viterbit.com",
  "between.tech",
  "simpleapply.ai",
  "pinpointhq.com",
  "rippling.com",
  "dover.com",
  "gem.com",
];

export interface MailEnvelope {
  fromAddress: string;
  fromName?: string | null;
  subject?: string | null;
}

export interface ApplicationCandidate {
  applicationId: number;
  companyName: string;
  website: string | null;
  title: string;
  stage: string;
  appliedAt: Date;
}

export interface PrefilterMatch {
  candidates: ApplicationCandidate[];
  /** How the best candidate matched. */
  via: "domain" | "platform";
}

export const MAX_CANDIDATES = 5;

export function senderDomain(address: string): string {
  return (address.split("@")[1] ?? "").trim().toLowerCase().replace(/\.$/, "");
}

/** Host of a company website without "www."; null for hiring platforms and junk. */
export function websiteDomain(website: string | null): string | null {
  if (!website) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || isHiringDomain(host)) return null;
  return host;
}

function domainMatches(sender: string, domain: string): boolean {
  return sender === domain || sender.endsWith(`.${domain}`);
}

export function isHiringDomain(domain: string): boolean {
  return HIRING_SENDERS.some((d) => domainMatches(domain, d));
}

/** Also match a company on a different subdomain of the same site (mail.x.com vs careers.x.com). */
function baseDomain(domain: string): string {
  const parts = domain.split(".");
  const twoLevel = /^(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

function mentions(haystack: string, company: string): boolean {
  if (company.length < 3) return false;
  return ` ${haystack} `.includes(` ${company} `);
}

/** LinkedIn sends alerts and news too; only application updates count. */
const LINKEDIN_APPLICATION = /application|applied|aplicaci|candidatura|solicitud/i;

/**
 * Returns the open applications an email may concern, or null when it concerns none.
 * Domain matches rank first, then the most recent application.
 */
export function matchReply(
  envelope: MailEnvelope,
  candidates: readonly ApplicationCandidate[],
  ownAddresses: readonly string[],
): PrefilterMatch | null {
  const from = envelope.fromAddress.trim().toLowerCase();
  if (!from.includes("@") || ownAddresses.includes(from)) return null;
  const sender = senderDomain(from);
  const subject = envelope.subject ?? "";
  const text = normalizeCompany(`${envelope.fromName ?? ""} ${subject}`);

  const byDomain = candidates.filter((c) => {
    const d = websiteDomain(c.website);
    return d !== null && (domainMatches(sender, d) || baseDomain(sender) === baseDomain(d));
  });

  let byPlatform: ApplicationCandidate[] = [];
  if (isHiringDomain(sender)) {
    const linkedinOk = !domainMatches(sender, "linkedin.com") || LINKEDIN_APPLICATION.test(subject);
    if (linkedinOk) {
      byPlatform = candidates.filter((c) => mentions(text, normalizeCompany(c.companyName)));
    }
  }

  const recent = (a: ApplicationCandidate, b: ApplicationCandidate) =>
    b.appliedAt.getTime() - a.appliedAt.getTime();
  const ordered = [
    ...[...byDomain].sort(recent),
    ...[...byPlatform].sort(recent).filter((c) => !byDomain.includes(c)),
  ];
  if (!ordered.length) return null;
  return {
    candidates: ordered.slice(0, MAX_CANDIDATES),
    via: byDomain.length ? "domain" : "platform",
  };
}
