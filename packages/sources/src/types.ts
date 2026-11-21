import type { LlmBudget, LlmClient, NormalizedOfferInput, Preferences } from "@job-radar/core";
import type { MyGreenhouseApplication } from "./adapters/mygreenhouse";
import type { PoliteFetcher } from "./http";
import type { BrowserAccess } from "./browser/sessions";

/** One job-alert email as parsed by the alert parsers. */
export interface AlertEmail {
  messageId: string;
  from: string;
  subject: string;
  date: Date | null;
  html: string | null;
  text: string | null;
}

/** An email account the job-alert source reads (job-alert-mailboxes D3). */
export interface AlertMailbox {
  id: number;
  label: string;
  /** Folders to read; `knownSendersOnly` for INBOX read only for known alert senders. */
  folders: { name: string; knownSendersOnly: boolean }[];
}

export interface AlertFolderRequest {
  folder: string;
  /** Envelope filter: only accepted messages are downloaded. */
  accept: (envelope: { fromAddress: string; fromName: string | null; subject: string }) => boolean;
}

export interface AlertFolderRead {
  folder: string;
  emails: AlertEmail[];
  /** Set when this folder could not be read (the account's other folders still were). */
  error?: string;
}

/**
 * Read-only access to the owner's email accounts for job alerts. The worker implements it with
 * the accounts' saved app passwords and per-folder alert cursors; adapters never see a password.
 */
export interface MailConnector {
  accounts(): AlertMailbox[];
  /** New messages since the folder's alert cursor (or `since` the first time). Throws when the account cannot connect. */
  read(
    account: AlertMailbox,
    folders: AlertFolderRequest[],
    since: Date,
  ): Promise<AlertFolderRead[]>;
}

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
  /** The owner's email accounts (job-alert source only). */
  mail?: MailConnector | undefined;
  /** A partial failure (one account of several): the run still succeeds and shows this error. */
  reportError?: ((message: string) => void) | undefined;
  /** Application statuses read from a candidate portal (mygreenhouse-source D4). */
  reportApplications?: ((applications: MyGreenhouseApplication[]) => void) | undefined;
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
