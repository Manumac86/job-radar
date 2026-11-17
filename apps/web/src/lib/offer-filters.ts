import type { OfferFilters } from "@job-radar/db";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) =>
  one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const SORTS = ["score", "posted", "company", "title", "rate", "created"] as const;

/** URL search params → typed query filters. Default view: open offers by score. */
export function parseOfferFilters(
  sp: SearchParams,
  pageSize = 50,
): OfferFilters & { page: number } {
  const page = Math.max(1, Number(one(sp["page"])) || 1);
  const sort = SORTS.find((s) => s === one(sp["sort"])) ?? "score";
  const triage = list(sp["triage"]);
  const posted = Number(one(sp["posted"]));
  const minRate = Number(one(sp["minRate"]));
  const maxRate = Number(one(sp["maxRate"]));
  return {
    page,
    scoreClass: list(sp["class"]) as OfferFilters["scoreClass"],
    triage: (triage.length ? triage : ["new", "shortlisted"]) as OfferFilters["triage"],
    sourceId: list(sp["source"]),
    engagementType: list(sp["engagement"]) as OfferFilters["engagementType"],
    remotePolicy: list(sp["remote"]) as OfferFilters["remotePolicy"],
    minRate: minRate > 0 ? minRate * 100 : undefined,
    maxRate: maxRate > 0 ? maxRate * 100 : undefined,
    postedAfter: posted > 0 ? new Date(Date.now() - posted * 86_400_000) : undefined,
    search: one(sp["q"]) || undefined,
    sort,
    direction: one(sp["dir"]) === "asc" ? "asc" : "desc",
    limit: pageSize,
    offset: (page - 1) * pageSize,
    // "Show applied" off by default: offers with an application are left out.
    applied: one(sp["applied"]) === "1" ? "include" : "exclude",
  };
}
