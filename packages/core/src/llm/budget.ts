import { appTimeZone } from "../time";
import { LlmCapReachedError, type LlmKind } from "./errors";

export interface UsageEntry {
  day: string;
  kind: LlmKind;
  model: string;
  ok: boolean;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  durationMs?: number | undefined;
}

/** Persistence for usage accounting (implemented over the llm_usage table). */
export interface UsageStore {
  count(day: string, kinds: LlmKind[]): number;
  record(entry: UsageEntry): void;
}

export interface DailyCaps {
  scoring: number;
  drafts: number;
  /** Company researches per day (company-research spec); one research is one unit. */
  research?: number | undefined;
}

export const DEFAULT_RESEARCH_CAP = 10;

export type CapGroup = "scoring" | "drafts" | "research";

/** HN extraction and email-fallback extraction count against the scoring cap (design D5). */
const CAP_GROUPS: Record<CapGroup, LlmKind[]> = {
  scoring: ["scoring", "extraction"],
  drafts: ["drafting"],
  research: ["research"],
};

function groupOf(kind: LlmKind): CapGroup {
  return kind === "drafting" ? "drafts" : kind === "research" ? "research" : "scoring";
}

function capOf(caps: DailyCaps, group: CapGroup): number {
  return group === "research" ? (caps.research ?? DEFAULT_RESEARCH_CAP) : caps[group];
}

/** Calendar day (YYYY-MM-DD) in the app time zone, so caps reset at local midnight. */
export function budgetDay(date: Date, timeZone: string = appTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type CapReachedListener = (event: {
  kind: LlmKind;
  group: CapGroup;
  cap: number;
  day: string;
}) => void;

export class LlmBudget {
  private readonly notified = new Set<string>();

  constructor(
    private readonly store: UsageStore,
    private readonly caps: () => DailyCaps,
    private readonly onCapReached: CapReachedListener = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  used(kind: LlmKind): number {
    return this.store.count(budgetDay(this.now()), CAP_GROUPS[groupOf(kind)]);
  }

  remaining(kind: LlmKind): number {
    return Math.max(0, capOf(this.caps(), groupOf(kind)) - this.used(kind));
  }

  /** Throws LlmCapReachedError (and notifies once per day and group) when the cap is used up. */
  assertAvailable(kind: LlmKind): void {
    const group = groupOf(kind);
    const cap = capOf(this.caps(), group);
    const day = budgetDay(this.now());
    if (this.store.count(day, CAP_GROUPS[group]) < cap) return;
    const key = `${day}:${group}`;
    if (!this.notified.has(key)) {
      this.notified.add(key);
      this.onCapReached({ kind, group, cap, day });
    }
    throw new LlmCapReachedError(kind, cap, day);
  }

  record(entry: Omit<UsageEntry, "day">): void {
    this.store.record({ ...entry, day: budgetDay(this.now()) });
  }

  summary(): {
    day: string;
    scoring: { used: number; cap: number };
    drafts: { used: number; cap: number };
    research: { used: number; cap: number };
  } {
    const day = budgetDay(this.now());
    const caps = this.caps();
    return {
      day,
      scoring: { used: this.store.count(day, CAP_GROUPS.scoring), cap: caps.scoring },
      drafts: { used: this.store.count(day, CAP_GROUPS.drafts), cap: caps.drafts },
      research: {
        used: this.store.count(day, CAP_GROUPS.research),
        cap: capOf(caps, "research"),
      },
    };
  }
}

/** In-memory store for tests and dry runs. */
export class MemoryUsageStore implements UsageStore {
  readonly entries: UsageEntry[] = [];
  count(day: string, kinds: LlmKind[]): number {
    return this.entries.filter((e) => e.day === day && kinds.includes(e.kind)).length;
  }
  record(entry: UsageEntry): void {
    this.entries.push(entry);
  }
}
