// Dover job details (simpleapply-dover-fixes D1). SimpleApply lists Dover-hosted jobs with the
// client's id as their company; Dover's careers page loads its public job data from the endpoint
// below, which carries the real company name, domain and full description. Public GET only:
// no cookies, never through the browser profile, and never to SimpleApply.
import {
  UNKNOWN_COMPANY,
  isIdLikeCompany,
  stripHtml,
  type NormalizedOfferInput,
} from "@job-radar/core";
import { HttpError, type PoliteFetcher } from "./http";

export const DOVER_JOB_API = "https://app.dover.com/api/v1/inbound/application-portal-job/";
/** Lookups per run at most; the rest keep the source's data until the next run. */
export const DOVER_MAX_LOOKUPS = 50;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The job id of a Dover job link (`jobs.dover.com/...`, `app.dover.com/apply/...`), or null. */
export function doverJobId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "dover.com" && !host.endsWith(".dover.com")) return null;
  const last = u.pathname.match(UUID)?.at(-1);
  return last ? last.toLowerCase() : null;
}

export interface DoverJob {
  companyName: string | null;
  companyWebsite: string | null;
  description: string;
}

interface DoverJobResponse {
  client_name?: string | null;
  client_domain?: string | null;
  user_provided_description?: string | null;
}

function website(domain: string | null | undefined): string | null {
  const d = domain
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? `https://${d}` : null;
}

/** Dover's public data for one job. Throws on an HTTP or network error. */
export async function fetchDoverJob(fetcher: PoliteFetcher, jobId: string): Promise<DoverJob> {
  const j = await fetcher.json<DoverJobResponse>(`${DOVER_JOB_API}${encodeURIComponent(jobId)}`);
  const name = j.client_name?.trim() ?? "";
  return {
    companyName: name && !isIdLikeCompany(name) ? name : null,
    companyWebsite: website(j.client_domain),
    description: j.user_provided_description ? stripHtml(j.user_provided_description) : "",
  };
}

/** True when an offer still needs Dover's data: its company is unknown or an id. */
export const needsDoverCompany = (companyName: string) =>
  companyName === UNKNOWN_COMPANY || isIdLikeCompany(companyName);

/**
 * Fills company, website and description of Dover offers that need it (`needsLookup`: not yet
 * stored, or stored with an unknown company). A missing job is skipped; any other failure stops
 * the lookups for this run, so an unavailable Dover never slows a run down or fails it.
 */
export async function enrichDoverOffers(
  offers: NormalizedOfferInput[],
  fetcher: PoliteFetcher,
  needsLookup: (offer: NormalizedOfferInput) => boolean,
  log: (line: string) => void = () => {},
  max = DOVER_MAX_LOOKUPS,
): Promise<NormalizedOfferInput[]> {
  let lookups = 0;
  let resolved = 0;
  let stopped = false;
  const out: NormalizedOfferInput[] = [];
  for (const offer of offers) {
    const id = doverJobId(offer.sourceUrl);
    if (!id || stopped || lookups >= max || !needsLookup(offer)) {
      out.push(offer);
      continue;
    }
    lookups++;
    try {
      const job = await fetchDoverJob(fetcher, id);
      if (job.companyName) resolved++;
      out.push({
        ...offer,
        companyName: job.companyName ?? offer.companyName,
        companyWebsite: job.companyWebsite ?? offer.companyWebsite ?? null,
        description: job.description || offer.description,
      });
    } catch (err) {
      out.push(offer);
      if (!(err instanceof HttpError && err.status === 404)) {
        stopped = true;
        log(
          `Dover job data unavailable (${err instanceof Error ? err.message : String(err)}); skipping lookups this run`,
        );
      }
    }
  }
  if (lookups) log(`Dover: ${resolved} of ${lookups} companies resolved`);
  return out;
}
