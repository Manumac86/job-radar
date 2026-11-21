import { ashbyAdapter, greenhouseAdapter, leverAdapter } from "./adapters/ats";
import { remoteOkAdapter, weWorkRemotelyAdapter } from "./adapters/feeds";
import { darwinAdapter } from "./adapters/darwin";
import { emailAlertsAdapter } from "./adapters/email";
import { hnHiringAdapter } from "./adapters/hn";
import { ycombinatorAdapter } from "./adapters/ycombinator";
import { loggedInAdapters } from "./adapters/logged-in";
import { simpleApplyAdapter } from "./adapters/simpleapply";
import type { SourceAdapter } from "./types";

/** Adapters by source type. Logged-in adapters register themselves in browser-sessions. */
export const adapters: Record<string, SourceAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  hn_hiring: hnHiringAdapter,
  remoteok: remoteOkAdapter,
  weworkremotely: weWorkRemotelyAdapter,
  darwin: darwinAdapter,
  email_alerts: emailAlertsAdapter,
  ycombinator: ycombinatorAdapter,
  ...Object.fromEntries(loggedInAdapters.map((a) => [a.type, a])),
  simpleapply: simpleApplyAdapter,
};

export function registerAdapter(adapter: SourceAdapter): void {
  adapters[adapter.type] = adapter;
}
