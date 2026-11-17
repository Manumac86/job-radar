import type { LlmBudget, LlmClient, NormalizedOfferInput, Preferences } from "@job-radar/core";
import type { PoliteFetcher } from "./http";
import type { BrowserAccess } from "./browser/sessions";

export interface SourceContext {
  sourceId: string;
  /** Source-specific settings from the sources table (and preferences.yaml for YC). */
  settings: Record<string, unknown>;
  preferences: Preferences;
  fetch: PoliteFetcher;
  log: (line: string) => void;
  signal?: AbortSignal | undefined;
  /** For LLM-light extraction (HN, email fallback). Counted in the scoring cap. */
  llm?: { client: LlmClient; budget?: LlmBudget | undefined; model: string } | undefined;
  /** Data directory, for adapters that read config files (companies.yaml). */
  dataDir: string;
  /** Reads a secret file from secrets/ (null when absent). Never log the value. */
  readSecret?: ((name: string) => string | null) | undefined;
  /** Read-only access to the isolated browser profile (logged-in sources only). */
  browser?: BrowserAccess | undefined;
  now: () => Date;
}

/** Every adapter yields offers already in the normalized shape. */
export interface SourceAdapter {
  type: string;
  /** Human label for Settings. */
  label: string;
  defaultIntervalMinutes: number;
  requiresLogin?: boolean;
  fetchOffers(ctx: SourceContext): Promise<NormalizedOfferInput[]>;
}
