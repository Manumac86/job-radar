// Hacker News "Who is hiring": latest thread via the HN Algolia API, top-level comments only.
// Headers follow the "Company | Role | Location | ..." convention and are parsed without an LLM;
// the fast model is used only for comments that do not follow it and pass the keyword filter.
import {
  UNTRUSTED_DATA_RULES,
  callStructured,
  parseCompensation,
  prefilter,
  wrapUntrusted,
  type NormalizedOfferInput,
} from "@job-radar/core";
import { z } from "zod";
import type { SourceAdapter, SourceContext } from "../types";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom, toDate } from "../util";

interface HnHit {
  objectID: string;
  title: string;
  created_at: string;
}
export interface HnComment {
  id: number;
  created_at?: string;
  author?: string;
  text?: string | null;
  parent_id?: number;
}

const ROLE_WORDS =
  /engineer|developer|cto|architect|lead|manager|head of|designer|scientist|founding|vp|director|devops|sre|programmer|full[- ]?stack|frontend|backend/i;
const LOCATION_WORDS =
  /remote|onsite|on-site|hybrid|\b[A-Z][a-z]+,\s?[A-Z]{2}\b|london|berlin|new york|nyc|sf\b|san francisco|europe|emea|usa|\bus\b|uk\b|worldwide|anywhere|madrid|paris|amsterdam|toronto/i;

export function parseHnHeader(textHtml: string): {
  company: string;
  title: string;
  location: string | null;
  header: string;
} | null {
  const firstPara = textHtml.split(/<p>/i)[0] ?? "";
  const header = htmlToText(firstPara).replace(/\s+/g, " ").trim();
  const parts = header
    .split(/\s+\|\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2 || header.length > 400) return null;
  const [first = "", second = ""] = parts;
  const company = first.replace(/\s*\(.*?\)\s*$/, "").trim();
  const role = parts.slice(1).find((p) => ROLE_WORDS.test(p)) ?? second;
  const locations = parts.slice(1).filter((p) => p !== role && LOCATION_WORDS.test(p));
  return { company, title: role, location: locations.join(" | ") || null, header };
}

const extractionSchema = z
  .object({
    is_job_post: z.boolean(),
    company: z.string().max(120),
    title: z.string().max(200),
    location: z.string().max(200).nullable(),
    remote: z.boolean(),
  })
  .strict();

async function extractWithLlm(ctx: SourceContext, text: string) {
  if (!ctx.llm) return null;
  const res = await callStructured(
    { client: ctx.llm.client, budget: ctx.llm.budget },
    {
      kind: "extraction",
      model: ctx.llm.model,
      system: `Extract the job post's company, role title and location from a Hacker News comment.\n${UNTRUSTED_DATA_RULES}`,
      prompt: wrapUntrusted("hn_comment", text.slice(0, 4000)),
      schema: extractionSchema,
      schemaName: "hn_job",
    },
  );
  return res.value.is_job_post ? res.value : null;
}

export function hnOfferFromComment(
  c: HnComment,
  parsed: { company: string; title: string; location: string | null; header: string },
  sourceId = "hn_hiring",
  threadTitle = "",
): NormalizedOfferInput {
  const text = htmlToText(c.text);
  const url = `https://news.ycombinator.com/item?id=${c.id}`;
  return {
    sourceId,
    externalId: String(c.id),
    sourceUrl: url,
    title: parsed.title,
    companyName: parsed.company,
    location: parsed.location,
    remotePolicy: inferRemotePolicy(parsed.header),
    regions: regionsFrom(parsed.location),
    engagementType: inferEngagement(parsed.header),
    compensation: parseCompensation(parsed.header),
    postedAt: toDate(c.created_at),
    description: text,
    applyMethod: "see post",
    applyUrl: url,
    companyMeta: { hn_thread: threadTitle },
    raw: { id: c.id, author: c.author, header: parsed.header },
  };
}

export const hnHiringAdapter: SourceAdapter = {
  type: "hn_hiring",
  label: 'Hacker News "Who is hiring"',
  defaultIntervalMinutes: 720,
  async fetchOffers(ctx) {
    const search = await ctx.fetch.json<{ hits: HnHit[] }>(
      "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=6",
    );
    const thread = search.hits.find((h) => /who is hiring/i.test(h.title));
    if (!thread) throw new Error('No "Who is hiring" thread found');
    const item = await ctx.fetch.json<{ children: HnComment[] }>(
      `https://hn.algolia.com/api/v1/items/${thread.objectID}`,
    );
    ctx.log(`${thread.title}: ${item.children.length} top-level comments`);
    const out: NormalizedOfferInput[] = [];
    let llmUsed = 0;
    let skipped = 0;
    for (const c of item.children) {
      if (!c.text) continue;
      let parsed = parseHnHeader(c.text);
      if (!parsed) {
        const plain = htmlToText(c.text);
        // Only spend an LLM call on posts that could pass the pre-filter anyway.
        const worth = prefilter(
          { title: plain.slice(0, 200), description: plain },
          {
            include: ctx.preferences.keywords.include,
            exclude: ctx.preferences.keywords.exclude,
          },
        ).pass;
        const extracted = worth ? await extractWithLlm(ctx, plain).catch(() => null) : null;
        if (worth && ctx.llm) llmUsed++;
        if (!extracted) {
          skipped++;
          continue;
        }
        parsed = {
          company: extracted.company,
          title: extracted.title,
          location: extracted.location,
          header: `${extracted.location ?? ""} ${extracted.remote ? "REMOTE" : ""}`,
        };
      }
      out.push(hnOfferFromComment(c, parsed, ctx.sourceId, thread.title));
    }
    ctx.log(`parsed ${out.length}, skipped ${skipped}, LLM extractions ${llmUsed}`);
    return out;
  },
};
