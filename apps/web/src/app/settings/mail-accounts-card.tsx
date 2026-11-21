"use client";

import {
  AlertTriangle,
  CheckCircle2,
  MailPlus,
  Pencil,
  PlugZap,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionResult } from "./actions";
import { checkMailNow, deleteMailAccount, saveMailAccount, testMailAccount } from "./mail-actions";

export interface MailAccountView {
  id: number;
  label: string;
  address: string;
  host: string;
  port: number;
  folders: string[];
  enabled: boolean;
  jobAlerts: boolean;
  alertFolders: string[];
  alertsInInbox: boolean;
  status: "new" | "ok" | "failed";
  lastError: string | null;
  lastCheckedAt: string | null;
  hasPassword: boolean;
}

const PRESETS = {
  gmail: {
    label: "Gmail / Google Workspace",
    host: "imap.gmail.com",
    help: "Create an app password at myaccount.google.com/apppasswords (2-step verification must be on).",
  },
  icloud: {
    label: "iCloud",
    host: "imap.mail.me.com",
    help: "Create an app-specific password at account.apple.com → Sign-In and Security. Works for custom domains hosted on iCloud too.",
  },
  custom: {
    label: "Other (IMAP)",
    host: "",
    help: "Use the IMAP server and an app password from your mail provider. Microsoft accounts that only allow OAuth sign-in are not supported.",
  },
} as const;
type Preset = keyof typeof PRESETS;

function presetOf(host: string): Preset {
  if (host === PRESETS.gmail.host) return "gmail";
  if (host === PRESETS.icloud.host) return "icloud";
  return "custom";
}

interface Draft {
  id?: number;
  label: string;
  address: string;
  preset: Preset;
  host: string;
  port: string;
  folders: string;
  enabled: boolean;
  jobAlerts: boolean;
  alertFolders: string;
  alertsInInbox: boolean;
  password: string;
  hasPassword: boolean;
}

const EMPTY: Draft = {
  label: "",
  address: "",
  preset: "gmail",
  host: PRESETS.gmail.host,
  port: "993",
  folders: "INBOX",
  enabled: true,
  jobAlerts: false,
  alertFolders: "",
  alertsInInbox: false,
  password: "",
  hasPassword: false,
};

const splitFolders = (v: string) =>
  v
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

/** "job-alerts, INBOX (alert senders only)" for the account list. */
function alertSummary(a: MailAccountView): string {
  const parts = [...a.alertFolders];
  if (a.alertsInInbox && !parts.some((f) => f.toUpperCase() === "INBOX")) {
    parts.push("INBOX (alert senders only)");
  }
  return parts.length ? parts.join(", ") : "no folder chosen";
}

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "never";

export function MailAccountsCard({
  accounts,
  workerRunning,
  checkMinutes,
}: {
  accounts: MailAccountView[];
  workerRunning: boolean;
  checkMinutes: number;
}) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<MailAccountView | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setErrors([]);
        after?.();
      } else {
        setErrors(r.errors ?? [r.error]);
        toast.error(r.error);
      }
    });

  const edit = (a: MailAccountView) => {
    setErrors([]);
    setEditing({
      id: a.id,
      label: a.label,
      address: a.address,
      preset: presetOf(a.host),
      host: a.host,
      port: String(a.port),
      folders: a.folders.join(", "),
      enabled: a.enabled,
      jobAlerts: a.jobAlerts,
      alertFolders: a.alertFolders.join(", "),
      alertsInInbox: a.alertsInInbox,
      password: "",
      hasPassword: a.hasPassword,
    });
  };

  return (
    <Card data-testid="mail-accounts">
      <CardHeader>
        <CardTitle>Email accounts</CardTitle>
        <CardDescription>
          Job Radar checks these mailboxes every {checkMinutes} minutes for replies to your
          applications, and reads job alerts from the accounts where you turn them on. Mailboxes are
          opened read-only: nothing is marked as read, moved, deleted or answered. Only emails from
          a company you applied to, or from a hiring platform that names it, are sent to Claude.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!workerRunning ? (
          <p className="text-sm text-muted-foreground">
            Start the worker to manage email accounts.
          </p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {a.label}
                    {!a.enabled ? <Badge variant="outline">Disabled</Badge> : null}
                    {a.status === "ok" ? (
                      <CheckCircle2 className="size-4 text-strong" aria-label="Connected" />
                    ) : null}
                  </p>
                  <p className="text-muted-foreground [overflow-wrap:anywhere]">
                    {a.address} · {a.host} · {a.folders.join(", ")}
                  </p>
                  {a.jobAlerts ? (
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      Job alerts: {alertSummary(a)}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Last check {when(a.lastCheckedAt)}
                    {a.hasPassword ? "" : " · no app password saved"}
                  </p>
                  {a.status === "failed" && a.lastError ? (
                    <p className="flex items-start gap-1 text-xs text-destructive" role="alert">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {a.lastError}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => testMailAccount(a.id))}
                  >
                    <PlugZap aria-hidden /> Test
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${a.label}`}
                    onClick={() => edit(a)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${a.label}`}
                    onClick={() => setDeleting(a)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!workerRunning}
            onClick={() => {
              setErrors([]);
              setEditing(EMPTY);
            }}
          >
            <MailPlus aria-hidden /> Add account
          </Button>
          <Button
            variant="secondary"
            disabled={pending || !workerRunning || !accounts.some((a) => a.enabled)}
            onClick={() => run(() => checkMailNow())}
          >
            <RefreshCw aria-hidden /> Check now
          </Button>
        </div>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? `Edit ${editing.label}` : "Add an email account"}
            </DialogTitle>
            <DialogDescription>{editing ? PRESETS[editing.preset].help : null}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-3"
              aria-label="Email account"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () =>
                    saveMailAccount({
                      ...(editing.id ? { id: editing.id } : {}),
                      label: editing.label,
                      address: editing.address,
                      host: editing.host,
                      port: editing.port,
                      folders: splitFolders(editing.folders),
                      enabled: editing.enabled,
                      jobAlerts: editing.jobAlerts,
                      alertFolders: splitFolders(editing.alertFolders),
                      alertsInInbox: editing.alertsInInbox,
                      password: editing.password,
                    }),
                  () => setEditing(null),
                );
              }}
            >
              {errors.length ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.join("; ")}
                </p>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="mail-provider">Provider</Label>
                <Select
                  value={editing.preset}
                  onValueChange={(v) => {
                    const preset = v as Preset;
                    setEditing({ ...editing, preset, host: PRESETS[preset].host || editing.host });
                  }}
                >
                  <SelectTrigger id="mail-provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRESETS) as Preset[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRESETS[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="mail-label">Name</Label>
                  <Input
                    id="mail-label"
                    value={editing.label}
                    placeholder="e.g. Personal"
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail-address">Email address</Label>
                  <Input
                    id="mail-address"
                    type="email"
                    value={editing.address}
                    onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  />
                </div>
              </div>
              {editing.preset === "custom" ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                  <div className="space-y-1">
                    <Label htmlFor="mail-host">IMAP server</Label>
                    <Input
                      id="mail-host"
                      value={editing.host}
                      placeholder="imap.example.com"
                      onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mail-port">Port</Label>
                    <Input
                      id="mail-port"
                      inputMode="numeric"
                      value={editing.port}
                      onChange={(e) => setEditing({ ...editing, port: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="mail-password">App password</Label>
                <Input
                  id="mail-password"
                  type="password"
                  autoComplete="off"
                  value={editing.password}
                  placeholder={editing.hasPassword ? "Saved. Type a new one to replace it" : ""}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Stored only in the secrets folder on this Mac and never shown again.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mail-folders">Folders for replies</Label>
                <Input
                  id="mail-folders"
                  value={editing.folders}
                  onChange={(e) => setEditing({ ...editing, folders: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated. Add a folder if a mail filter moves replies out of INBOX.
                </p>
              </div>
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={editing.enabled}
                  onCheckedChange={(v) => setEditing({ ...editing, enabled: v === true })}
                />
                Check this account
              </Label>
              <fieldset className="space-y-2 rounded-md border p-3" aria-label="Job alerts">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={editing.jobAlerts}
                    onCheckedChange={(v) => setEditing({ ...editing, jobAlerts: v === true })}
                  />
                  Read job alerts from this account
                </Label>
                {editing.jobAlerts ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="mail-alert-folders">Alert folders or labels</Label>
                      <Input
                        id="mail-alert-folders"
                        value={editing.alertFolders}
                        placeholder="e.g. job-alerts"
                        onChange={(e) => setEditing({ ...editing, alertFolders: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Comma-separated. Every message in these folders is read as a job alert.
                      </p>
                    </div>
                    <Label className="flex items-start gap-2 text-sm font-normal">
                      <Checkbox
                        className="mt-0.5"
                        checked={editing.alertsInInbox}
                        onCheckedChange={(v) =>
                          setEditing({ ...editing, alertsInInbox: v === true })
                        }
                      />
                      Also look in INBOX (only alerts from LinkedIn, Upwork, Malt, Wellfound and
                      Greenhouse; other mail there is never read)
                    </Label>
                    {!splitFolders(editing.alertFolders).length && !editing.alertsInInbox ? (
                      <p className="text-xs text-destructive" role="status">
                        Choose a folder or INBOX.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save account
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleting?.label}?</DialogTitle>
            <DialogDescription>
              Job Radar stops checking this mailbox and deletes its saved app password. Emails
              already matched to applications stay in their timelines.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const id = deleting?.id;
                if (id)
                  run(
                    () => deleteMailAccount(id),
                    () => setDeleting(null),
                  );
              }}
            >
              Remove account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
