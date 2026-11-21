// Read-only IMAP reader for replies to applications (application-emails D2). Folders are opened
// with EXAMINE; only envelopes are fetched until the local prefilter says a message matches.
// Nothing here can mark, move, delete, flag or answer mail: the client surface it uses has no
// such methods.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText } from "../util";

/** The read-only slice of imapflow this reader uses (tests pass a fake). */
export interface ReadOnlyImap {
  connect(): Promise<void>;
  mailboxOpen(
    path: string,
    options: { readOnly: true },
  ): Promise<{ uidValidity: bigint | number; exists: number }>;
  search(query: Record<string, unknown>, options: { uid: true }): Promise<number[] | false>;
  fetch(
    range: number[],
    query: { envelope: true; internalDate: true; uid: true },
    options: { uid: true },
  ): AsyncIterable<{
    uid: number;
    envelope?: {
      messageId?: string;
      subject?: string;
      date?: Date;
      from?: { name?: string; address?: string }[];
    };
    internalDate?: Date | string;
  }>;
  fetchOne(
    uid: string,
    query: { source: true },
    options: { uid: true },
  ): Promise<{ source?: Buffer } | false>;
  logout(): Promise<void>;
  close(): void;
}

export interface ImapAccount {
  host: string;
  port: number;
  user: string;
  password: string;
}

export function connectImap(account: ImapAccount): ReadOnlyImap {
  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
    disableAutoIdle: true,
  }) as unknown as ReadOnlyImap;
}

export interface ReplyEnvelope {
  uid: number;
  messageId: string | null;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
}

export interface FetchedReply extends ReplyEnvelope {
  /** Plain text of the body (HTML converted). */
  text: string;
}

export interface FolderCursor {
  uidValidity: string;
  lastUid: number;
}

export interface FolderResult {
  folder: string;
  cursor: FolderCursor;
  scanned: number;
  matched: FetchedReply[];
}

type FetchedEnvelope =
  Parameters<ReadOnlyImap["fetch"]> extends unknown[]
    ? ReturnType<ReadOnlyImap["fetch"]> extends AsyncIterable<infer M>
      ? M
      : never
    : never;

function toEnvelope(raw: FetchedEnvelope): ReplyEnvelope | null {
  const from = raw.envelope?.from?.[0];
  if (!from?.address) return null;
  const when = raw.internalDate ?? raw.envelope?.date;
  return {
    uid: raw.uid,
    messageId: raw.envelope?.messageId?.trim() || null,
    fromName: from.name?.trim() || null,
    fromAddress: from.address.trim(),
    subject: raw.envelope?.subject ?? "",
    receivedAt: when ? new Date(when) : new Date(0),
  };
}

/**
 * Reads one folder after its cursor (or since `since` on the first run or after a UIDVALIDITY
 * change). `isMatch` runs on envelopes; bodies are fetched only for matches.
 */
export async function readFolder(
  client: ReadOnlyImap,
  folder: string,
  cursor: FolderCursor | undefined,
  since: Date,
  isMatch: (e: ReplyEnvelope) => boolean,
): Promise<FolderResult> {
  const box = await client.mailboxOpen(folder, { readOnly: true });
  const uidValidity = String(box.uidValidity);
  const continuing = cursor && cursor.uidValidity === uidValidity;
  const found = continuing
    ? await client.search({ uid: `${cursor.lastUid + 1}:*` }, { uid: true })
    : await client.search({ since }, { uid: true });
  // "n:*" always returns the newest message, even when it is older than n.
  const uids = (found || []).filter((u) => !continuing || u > cursor.lastUid).sort((a, b) => a - b);
  const envelopes: ReplyEnvelope[] = [];
  if (uids.length) {
    for await (const msg of client.fetch(
      uids,
      { envelope: true, internalDate: true, uid: true },
      { uid: true },
    )) {
      const e = toEnvelope(msg);
      if (e) envelopes.push(e);
    }
  }
  const matched: FetchedReply[] = [];
  for (const e of envelopes.filter(isMatch)) {
    const full = await client.fetchOne(String(e.uid), { source: true }, { uid: true });
    if (!full || !full.source) continue;
    const mail = await simpleParser(full.source);
    const html = typeof mail.html === "string" ? mail.html : "";
    matched.push({
      ...e,
      messageId: mail.messageId?.trim() || e.messageId,
      text: mail.text?.trim() || (html ? htmlToText(html) : ""),
    });
  }
  const lastUid = Math.max(continuing ? cursor.lastUid : 0, ...uids, 0);
  return { folder, cursor: { uidValidity, lastUid }, scanned: envelopes.length, matched };
}

/** Opens INBOX read-only and returns how many messages it holds. */
export async function testImapConnection(client: ReadOnlyImap): Promise<number> {
  await client.connect();
  try {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    return box.exists;
  } finally {
    await client.logout().catch(() => {});
  }
}

const APP_PASSWORD_HELP: Record<string, string> = {
  "imap.gmail.com":
    "create an app password at myaccount.google.com/apppasswords (2-step verification must be on)",
  "imap.mail.me.com":
    "create an app-specific password at account.apple.com → Sign-In and Security; the user name is the full address",
};

/** imapflow errors turned into a message that names what to fix, without the password. */
export function describeMailError(err: unknown, host: string, folder?: string): string {
  const e = (err ?? {}) as {
    message?: string;
    responseText?: string;
    serverResponseCode?: string;
    authenticationFailed?: boolean;
    code?: string;
  };
  if (e.authenticationFailed || e.serverResponseCode === "AUTHENTICATIONFAILED") {
    return `${host} rejected the login: check the address and ${APP_PASSWORD_HELP[host] ?? "use an app password from your mail provider"}.`;
  }
  if (
    e.serverResponseCode === "NONEXISTENT" ||
    /nonexistent|doesn't exist|not found/i.test(e.responseText ?? "")
  ) {
    return `Folder "${folder ?? "?"}" does not exist on ${host}.`;
  }
  if (e.code === "ENOTFOUND") return `Mail server ${host} was not found: check the host name.`;
  if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
    return `Could not reach ${host}: check the host and port (IMAP over TLS is usually 993).`;
  }
  const detail = [e.serverResponseCode, e.responseText].filter(Boolean).join(" ");
  return detail ? `IMAP error: ${detail}` : (e.message ?? String(err));
}
