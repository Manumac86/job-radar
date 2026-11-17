import {
  appTimeZone,
  budgetDay,
  nextMidnight,
  type LlmBudget,
  type LlmClient,
} from "@job-radar/core";
import {
  failStaleRuns,
  finishRun,
  getSource,
  startRun,
  updateSource,
  type Db,
  type Run,
} from "@job-radar/db";
import {
  SessionExpiredError,
  createPoliteFetcher,
  type BrowserAccess,
  type PoliteFetcher,
  type SourceAdapter,
} from "@job-radar/sources";
import { errorMessage, log, redact } from "../log";
import type { Notifier } from "../notifier";
import type { ProfileService } from "../profile-service";
import { ingestOffers } from "./pipeline";
import { readSecretFile } from "../secrets";

export const MAX_CONSECUTIVE_FAILURES = 5;
const STOP_TIME_ZONE = appTimeZone();

export interface RunnerDeps {
  db: Db;
  profile: ProfileService;
  notifier: Notifier;
  dataDir: string;
  secretsDir?: string;
  /** Isolated browser profile for logged-in sources. */
  browser?: BrowserAccess;
  adapters: Record<string, SourceAdapter>;
  fetcherFactory?: (onLog: (l: string) => void) => PoliteFetcher;
  llm?: { client: LlmClient; budget?: LlmBudget } | undefined;
  /** Called with ids of new, unfiltered offers (they go to the scoring queue). */
  onNewOffers?: (offerIds: number[]) => void;
  now?: () => Date;
}

export type RunOutcome =
  | { status: "finished"; run: Run }
  | { status: "already_running" }
  | { status: "disabled" }
  | { status: "not_found" };

/** Executes one source run end to end and records it in the run log. */
export async function executeRun(
  deps: RunnerDeps,
  sourceId: string,
  trigger: "schedule" | "manual",
): Promise<RunOutcome> {
  const now = deps.now ?? (() => new Date());
  const source = getSource(deps.db, sourceId);
  if (!source) return { status: "not_found" };
  // Logged-in sources never run unless the owner enabled them after the risk notice.
  if (source.requiresLogin && !source.enabled) return { status: "disabled" };
  const started = startRun(deps.db, sourceId, trigger, now());
  if (!started) return { status: "already_running" };

  const lines: string[] = [];
  const addLine = (l: string) => {
    if (lines.length < 300) lines.push(redact(l));
  };
  try {
    const adapter = deps.adapters[source.type];
    if (!adapter) throw new Error(`No adapter for source type "${source.type}"`);
    const profile = deps.profile.get();
    if (!profile)
      throw new Error("Profile is missing or invalid; fix it in Settings before running sources");
    const fetcher = deps.fetcherFactory
      ? deps.fetcherFactory(addLine)
      : createPoliteFetcher({ onLog: addLine, minIntervalMs: 1000 });
    const ysettings = profile.preferences.sources[source.type] ?? {};
    const raw = await adapter.fetchOffers({
      sourceId,
      settings: { ...ysettings, ...source.settings },
      preferences: profile.preferences,
      fetch: fetcher,
      log: addLine,
      dataDir: deps.dataDir,
      browser: deps.browser,
      readSecret: (name) => (deps.secretsDir ? readSecretFile(deps.secretsDir, name) : null),
      now,
      llm: deps.llm
        ? { ...deps.llm, model: profile.preferences.scoring.models.scoring }
        : undefined,
    });
    const counts = ingestOffers(deps.db, sourceId, raw, profile.preferences, now(), addLine);
    addLine(
      `found ${counts.found}, new ${counts.newCount}, filtered ${counts.filtered}, duplicates ${counts.duplicates}, already known ${counts.updated}${counts.invalid ? `, invalid ${counts.invalid}` : ""}`,
    );
    const run = finishRun(deps.db, started.id, {
      status: counts.invalid > 0 && counts.invalid === counts.found ? "failed" : "ok",
      found: counts.found,
      newCount: counts.newCount,
      filtered: counts.filtered,
      duplicates: counts.duplicates,
      log: lines,
      at: now(),
    });
    updateSource(deps.db, sourceId, { consecutiveFailures: 0, status: "ok", stoppedUntil: null });
    if (counts.newOfferIds.length) deps.onNewOffers?.(counts.newOfferIds);
    log.info("source run finished", { sourceId, ...counts, newOfferIds: undefined });
    return { status: "finished", run };
  } catch (err) {
    const message = errorMessage(err);
    addLine(`error: ${message}`);
    if (err instanceof SessionExpiredError) {
      // A login wall is not a source failure: stop runs until the owner logs in again.
      const run = finishRun(deps.db, started.id, {
        status: "failed",
        error: message,
        log: lines,
        at: now(),
      });
      updateSource(deps.db, sourceId, { status: "session_expired" });
      deps.notifier.notify({
        kind: "session_expired",
        title: `${source.name}: session expired`,
        body: "The site showed its login page. Log in again from Settings → Sessions; runs are paused until then.",
        dedupeKey: `session_expired:${sourceId}:${budgetDay(now())}`,
      });
      return { status: "finished", run };
    }
    const run = finishRun(deps.db, started.id, {
      status: "failed",
      error: message,
      log: lines,
      at: now(),
    });
    const failures = source.consecutiveFailures + 1;
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      const until = nextMidnight(now(), STOP_TIME_ZONE);
      updateSource(deps.db, sourceId, {
        consecutiveFailures: failures,
        status: "stopped",
        stoppedUntil: until,
      });
      deps.notifier.notify({
        kind: "source_stopped",
        title: `${source.name} stopped for today`,
        body: `${source.name} failed ${failures} times in a row and is paused until tomorrow. Last error: ${message}`,
        dedupeKey: `source_stopped:${sourceId}:${budgetDay(now())}`,
      });
    } else {
      updateSource(deps.db, sourceId, { consecutiveFailures: failures, status: "failing" });
    }
    log.warn("source run failed", { sourceId, error: message, failures });
    return { status: "finished", run };
  }
}

export { failStaleRuns };
