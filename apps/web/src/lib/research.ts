import "server-only";
import {
  currentCompanyResearch,
  isResearchFresh,
  latestCompanyResearch,
  type Offer,
} from "@job-radar/db";
import { db } from "./db";
import { formatRelative } from "./format";

/** Shape of the stored profile (core `CompanyProfile`; the web does not import core's root). */
type Fact<T> = { value: T; sources: string[] } | null;
interface StoredProfile {
  website: string | null;
  product: Fact<string>;
  funding: Fact<{
    stage: string;
    last_round: string | null;
    date: string | null;
    amount: string | null;
  }>;
  headcount: Fact<number>;
  engineering_team_size: Fact<number>;
  headquarters: Fact<string>;
  remote_policy: Fact<string>;
  tech_stack: Fact<string[]>;
  news: { date: string; headline: string; source: string }[];
  red_flags: { text: string; source: string }[];
}

export const CAP_WAIT_MESSAGE = "Research queued: daily limit reached";

export interface CompanyCardData {
  state: "none" | "queued" | "running" | "done" | "partial" | "failed";
  /** Shown above the facts: "Researching company…", "Research failed: …". */
  message: string | null;
  facts: { label: string; value: string; sources: string[] }[];
  news: { date: string; headline: string; source: string }[];
  redFlags: { text: string; source: string }[];
  website: string | null;
  researched: string | null;
  partial: boolean;
  limited: boolean;
  fresh: boolean;
}

function stageLabel(f: NonNullable<StoredProfile["funding"]>["value"]): string {
  const stage = f.stage.replace(/-/g, " ");
  const round = [f.last_round, f.amount, f.date].filter(Boolean).join(", ");
  return round ? `${stage[0]?.toUpperCase()}${stage.slice(1)} · ${round}` : stage;
}

export function companyCardData(offer: Offer, now = new Date()): CompanyCardData | null {
  if (!offer.companyId) return null;
  const latest = latestCompanyResearch(db(), offer.companyId);
  const current = currentCompanyResearch(db(), offer.companyId);
  const p = (current?.profile as StoredProfile | null | undefined) ?? null;
  const facts: CompanyCardData["facts"] = [];
  if (p) {
    const add = (label: string, f: Fact<unknown>, value: (v: never) => string) => {
      if (f) facts.push({ label, value: value(f.value as never), sources: f.sources });
    };
    add("Product", p.product, (v: string) => v);
    add("Funding", p.funding, stageLabel);
    add("Headcount", p.headcount, (v: number) => `about ${v}`);
    add("Engineering team", p.engineering_team_size, (v: number) => `about ${v}`);
    add("Headquarters", p.headquarters, (v: string) => v);
    add("Remote policy", p.remote_policy, (v: string) => v);
    add("Tech stack", p.tech_stack, (v: string[]) => v.join(", "));
  }
  let message: string | null = null;
  if (latest?.status === "queued")
    message = latest.error === CAP_WAIT_MESSAGE ? CAP_WAIT_MESSAGE : "Researching company…";
  else if (latest?.status === "running") message = "Researching company…";
  else if (latest?.status === "failed")
    message = `Research failed: ${latest.error ?? "unknown error"}`;
  const meta = current?.meta ?? {};
  return {
    state: latest?.status ?? "none",
    message,
    facts,
    news: p?.news ?? [],
    redFlags: p?.red_flags ?? [],
    website: p?.website ?? null,
    researched: current?.finishedAt ? formatRelative(current.finishedAt, now) : null,
    partial: current?.status === "partial",
    limited: meta["webSearchUnavailable"] === true,
    fresh: isResearchFresh(current, now),
  };
}
