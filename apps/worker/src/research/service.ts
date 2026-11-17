// Company research (company-research spec; design D4–D5): one research at a time, deduped
// per company, its own daily cap, triggered research waits for the next day at the cap.
import {
  appTimeZone,
  LlmCapReachedError,
  LlmUnavailableError,
  nextMidnight,
  researchCompany,
  type CompanyProfile,
  type LlmBudget,
  type LlmClient,
  type ResearchClient,
} from "@job-radar/core";
import {
  currentCompanyResearch,
  deferCompanyResearch,
  dueCompanyResearch,
  failCompanyResearch,
  finishCompanyResearch,
  getCompany,
  getCompanyResearch,
  getOffer,
  isResearchFresh,
  latestCompanyResearch,
  requestCompanyResearch,
  startCompanyResearch,
  type CompanyResearch,
  type Db,
  type ResearchReason,
} from "@job-radar/db";
import { createPageReader, formatReadPage, type PageReader } from "@job-radar/sources";
import PQueue from "p-queue";
import { errorMessage, log } from "../log";
import type { ProfileService } from "../profile-service";

export const CAP_WAIT_MESSAGE = "Research queued: daily limit reached";
/** How long interview prep waits for a research it requested (design D6). */
export const PREP_RESEARCH_WAIT_MS = 150_000;

export class ResearchError extends Error {
  override readonly name = "ResearchError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type ResearchFinishedHook = (row: CompanyResearch) => void | Promise<void>;

export interface ResearchState {
  state: "none" | "queued" | "running" | "done" | "partial" | "failed";
  /** The latest row (any status). */
  latest: CompanyResearch | null;
  /** The current profile, if any (the latest done/partial row). */
  current: CompanyResearch | null;
  fresh: boolean;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export class ResearchService {
  private readonly queue = new PQueue({ concurrency: 1 });
  private readonly scheduled = new Set<number>();
  private readonly waiters = new Map<number, (() => void)[]>();
  private hooks: ResearchFinishedHook[] = [];

  constructor(
    private readonly deps: {
      db: Db;
      profile: ProfileService;
      research: ResearchClient;
      client: LlmClient;
      budget: LlmBudget;
      newReader?: () => PageReader;
      timeoutMs?: number;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  onFinished(hook: ResearchFinishedHook): void {
    this.hooks.push(hook);
  }

  remaining(): number {
    return this.deps.budget.remaining("research");
  }

  state(companyId: number): ResearchState {
    const latest = latestCompanyResearch(this.deps.db, companyId) ?? null;
    const current = currentCompanyResearch(this.deps.db, companyId) ?? null;
    return {
      state: latest?.status ?? "none",
      latest,
      current,
      fresh: isResearchFresh(current ?? undefined, this.now()),
    };
  }

  /**
   * Queues research for a company unless one is active or fresh (or `force`). Manual research
   * at the cap is refused with the cap message; triggered research is queued for tomorrow.
   */
  request(
    companyId: number,
    opts: { offerId?: number | null; reason: ResearchReason; force?: boolean },
  ): { kind: "active" | "fresh" | "queued"; row: CompanyResearch } {
    const { db } = this.deps;
    if (!getCompany(db, companyId)) throw new ResearchError("Company not found", 404);
    const capped = this.remaining() <= 0;
    if (capped && opts.reason === "manual") {
      const cap = this.deps.budget.summary().research.cap;
      throw new ResearchError(
        `Daily research limit of ${cap} reached. Try again after midnight (${appTimeZone()}).`,
        429,
      );
    }
    const outcome = requestCompanyResearch(db, { companyId, ...opts, now: this.now() });
    if (outcome.kind === "queued") {
      if (capped) {
        deferCompanyResearch(db, outcome.row.id, this.midnight(), CAP_WAIT_MESSAGE);
        return { kind: "queued", row: getCompanyResearch(db, outcome.row.id) ?? outcome.row };
      }
      this.schedule(outcome.row.id);
    }
    return outcome;
  }

  /** Runs queued research whose wait is over (startup, every 10 minutes, after midnight). */
  sweep(): number {
    let n = 0;
    for (const row of dueCompanyResearch(this.deps.db, this.now())) {
      if (this.remaining() <= 0) break;
      if (this.schedule(row.id)) n++;
    }
    return n;
  }

  /**
   * For interview prep: a fresh profile, requesting research and waiting for it when there is
   * none and budget remains. Returns null when research is unavailable.
   */
  async freshProfile(
    companyId: number,
    offerId: number | null,
    waitMs = PREP_RESEARCH_WAIT_MS,
  ): Promise<CompanyResearch | null> {
    const st = this.state(companyId);
    if (st.fresh && st.current) return st.current;
    if (this.remaining() <= 0 && st.state !== "running" && st.state !== "queued") return st.current;
    let row: CompanyResearch;
    try {
      row = this.request(companyId, { offerId, reason: "prep" }).row;
    } catch {
      return st.current;
    }
    if (row.status === "done" || row.status === "partial") return row;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, waitMs);
      const list = this.waiters.get(row.id) ?? [];
      list.push(() => {
        clearTimeout(t);
        resolve();
      });
      this.waiters.set(row.id, list);
    });
    const after = this.state(companyId);
    return after.current;
  }

  async idle(): Promise<void> {
    await this.queue.onIdle();
  }

  private midnight(): Date {
    return nextMidnight(this.now(), appTimeZone());
  }

  private schedule(rowId: number): boolean {
    if (this.scheduled.has(rowId)) return false;
    this.scheduled.add(rowId);
    void this.queue.add(async () => {
      try {
        await this.runOne(rowId);
      } finally {
        this.scheduled.delete(rowId);
        for (const w of this.waiters.get(rowId) ?? []) w();
        this.waiters.delete(rowId);
      }
    });
    return true;
  }

  async runOne(rowId: number): Promise<void> {
    const { db } = this.deps;
    const row = getCompanyResearch(db, rowId);
    if (!row || row.status !== "queued") return;
    const company = getCompany(db, row.companyId);
    if (!company) return failCompanyResearch(db, rowId, "Company not found", this.now());
    const prefs = this.deps.profile.get()?.preferences;
    if (!prefs) {
      log.warn("research skipped: profile invalid", { rowId });
      return; // stays queued
    }
    const offer = row.offerId ? getOffer(db, row.offerId) : undefined;
    const website = company.website ?? offer?.companyWebsite ?? null;
    const hintHosts = [
      ...new Set([hostOf(offer?.applyUrl), hostOf(offer?.sourceUrl)].filter((h) => h !== null)),
    ];
    const reader = this.deps.newReader?.() ?? createPageReader();
    startCompanyResearch(db, rowId, this.now());
    try {
      const out = await researchCompany(
        { research: this.deps.research, client: this.deps.client, budget: this.deps.budget },
        {
          model: prefs.scoring.models.drafting,
          target: {
            companyName: company.name,
            website,
            hintHosts,
            offerTitle: offer?.title ?? null,
          },
          tools: { readPage: async (url) => formatReadPage(await reader.read(url)) },
          readUrls: reader.readUrls,
          ...(this.deps.timeoutMs ? { timeoutMs: this.deps.timeoutMs } : {}),
          now: () => this.now(),
        },
      );
      finishCompanyResearch(db, rowId, {
        status: out.status,
        profile: out.profile as unknown as Record<string, unknown>,
        readUrls: [...reader.readUrls],
        model: out.model,
        meta: {
          pagesRead: out.pagesRead,
          dropped: out.dropped.length,
          webSearchUnavailable: out.webSearchUnavailable,
          durationMs: out.durationMs,
        },
        now: this.now(),
      });
      log.info("company researched", {
        companyId: company.id,
        status: out.status,
        pagesRead: out.pagesRead,
      });
      const done = getCompanyResearch(db, rowId);
      if (done) {
        for (const hook of this.hooks) {
          await Promise.resolve(hook(done)).catch((err: unknown) =>
            log.error("research hook failed", { rowId, error: errorMessage(err) }),
          );
        }
      }
    } catch (err) {
      if (err instanceof LlmCapReachedError) {
        deferCompanyResearch(db, rowId, this.midnight(), CAP_WAIT_MESSAGE);
        return;
      }
      const message =
        err instanceof LlmUnavailableError
          ? err.reason === "not_authenticated"
            ? "Claude Code CLI not logged in"
            : err.message
          : errorMessage(err);
      failCompanyResearch(db, rowId, message, this.now());
      log.warn("company research failed", { rowId, error: message });
    }
  }
}

/** The stored profile as the core type (validated when it was written). */
export function storedProfile(row: CompanyResearch | null | undefined): CompanyProfile | null {
  return (row?.profile as unknown as CompanyProfile | null | undefined) ?? null;
}
