import { listSources, updateSource, type Db, type Source } from "@job-radar/db";
import cron, { type ScheduledTask } from "node-cron";
import PQueue from "p-queue";
import { log } from "../log";
import { executeRun, type RunOutcome, type RunnerDeps } from "./runner";

export type RunRequestResult = "started" | "queued" | "already_running" | "not_found" | "disabled";

/**
 * node-cron ticks every minute and enqueues due sources; p-queue runs them with
 * concurrency 2 for public HTTP sources and 1 for browser sources (design D6).
 * State lives in `runs` and `sources`, so a restart resumes cleanly.
 */
export class Scheduler {
  private readonly httpQueue = new PQueue({ concurrency: 2 });
  private readonly browserQueue = new PQueue({ concurrency: 1 });
  private readonly pending = new Set<string>();
  private readonly active = new Set<string>();
  private task: ScheduledTask | null = null;
  readonly finished: RunOutcome[] = [];

  constructor(
    private readonly deps: RunnerDeps & { db: Db },
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(): void {
    this.task = cron.schedule("* * * * *", () => this.tick(), { name: "source-scheduler" });
    void this.tick();
  }

  stop(): void {
    void this.task?.stop();
    this.task = null;
  }

  isDue(source: Source, now = this.now()): boolean {
    if (!source.enabled) return false;
    if (source.status === "session_expired" || source.status === "logged_out") return false;
    if (source.status === "stopped" && source.stoppedUntil && source.stoppedUntil > now)
      return false;
    if (!source.lastRunAt) return true;
    return source.lastRunAt.getTime() + source.intervalMinutes * 60_000 <= now.getTime();
  }

  /** Enqueues every due source. Returns the ids enqueued. */
  tick(now = this.now()): string[] {
    const enqueued: string[] = [];
    for (const source of listSources(this.deps.db)) {
      if (source.status === "stopped" && source.stoppedUntil && source.stoppedUntil <= now) {
        updateSource(this.deps.db, source.id, {
          status: "ok",
          consecutiveFailures: 0,
          stoppedUntil: null,
        });
        source.status = "ok";
      }
      if (this.isDue(source, now) && this.enqueue(source, "schedule") === "queued")
        enqueued.push(source.id);
    }
    return enqueued;
  }

  /** "Run now" from the UI. */
  runNow(sourceId: string): RunRequestResult {
    const source = listSources(this.deps.db).find((s) => s.id === sourceId);
    if (!source) return "not_found";
    if (source.requiresLogin && !source.enabled) return "disabled";
    const r = this.enqueue(source, "manual");
    return r === "queued" ? "started" : r;
  }

  isBusy(sourceId: string): boolean {
    return this.pending.has(sourceId) || this.active.has(sourceId);
  }

  private enqueue(source: Source, trigger: "schedule" | "manual"): "queued" | "already_running" {
    if (this.isBusy(source.id)) return "already_running";
    this.pending.add(source.id);
    const queue = source.requiresLogin ? this.browserQueue : this.httpQueue;
    void queue.add(async () => {
      this.pending.delete(source.id);
      this.active.add(source.id);
      try {
        const outcome = await executeRun(this.deps, source.id, trigger);
        this.finished.push(outcome);
        if (this.finished.length > 50) this.finished.shift();
      } catch (err) {
        log.error("run crashed", { sourceId: source.id, error: String(err) });
      } finally {
        this.active.delete(source.id);
      }
    });
    return "queued";
  }

  async idle(): Promise<void> {
    await Promise.all([this.httpQueue.onIdle(), this.browserQueue.onIdle()]);
  }
}
