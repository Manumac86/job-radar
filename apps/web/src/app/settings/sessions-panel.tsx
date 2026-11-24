"use client";

import { ExternalLink, LogIn, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsRemote } from "@/hooks/use-is-remote";
import { useDesktopBridge } from "@/lib/desktop";
import { useBrowserInstall } from "./desktop-card";
import { loginStep } from "./login-step";
import { checkSiteSession, deleteBrowserProfile, finishLogin, startLogin } from "./actions";

export interface SessionView {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
}

const STATUS: Record<string, string> = {
  ok: "Logged in",
  session_expired: "Session expired",
  logged_out: "Logged out",
  failing: "Failing",
  stopped: "Stopped",
};

/** Chromium is needed for logins and logged-in sources; never downloaded without asking. */
function BrowserMissing({ onClose }: { onClose: () => void }) {
  const bridge = useDesktopBridge();
  const browser = useBrowserInstall(bridge, onClose);
  const remote = useIsRemote();
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="browser-missing">
      <p className="font-medium">Chromium for logged-in sources is not installed (about 150 MB).</p>
      {remote ? (
        <p className="text-muted-foreground">
          Install it at the Mac, where the login window opens, then click Log in again.
        </p>
      ) : bridge ? (
        <p className="text-muted-foreground">
          Download it once; then click Log in again. Nothing is downloaded until you confirm.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Install it with <code>pnpm exec playwright install chromium</code> in the repository, then
          click Log in again.
        </p>
      )}
      <div className="flex gap-2">
        {bridge ? (
          <Button size="sm" disabled={browser.pending} onClick={browser.install}>
            {browser.pending ? (browser.progress ?? "Downloading…") : "Download Chromium"}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** Login sessions for logged-in sources (browser-sessions spec). No password ever passes through the app. */
export function SessionsPanel({ sessions }: { sessions: SessionView[] }) {
  const [pending, start] = useTransition();
  const [active, setActive] = useState<{
    site: string;
    viewerUrl: string | null;
    message: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [browserMissing, setBrowserMissing] = useState(false);
  const remote = useIsRemote();

  return (
    <Card data-testid="sessions-panel">
      <CardHeader>
        <CardTitle>Site sessions</CardTitle>
        <CardDescription>
          Log in yourself, with your password manager and 2FA, in an isolated browser profile that
          is separate from your everyday browser. Job Radar stores only that profile&apos;s cookies,
          never passwords.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {remote ? (
          <p className="text-sm text-muted-foreground" data-testid="remote-login-note">
            Job Radar is open through its remote address: the login window opens on the Mac, so log
            in there.
          </p>
        ) : null}
        {browserMissing ? <BrowserMissing onClose={() => setBrowserMissing(false)} /> : null}
        {active ? (
          <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="login-in-progress">
            <p>{active.message}</p>
            {active.viewerUrl ? (
              <a
                href={active.viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                Open the login viewer <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <div>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await finishLogin();
                    if (r.ok) toast.success(r.message ?? "Done");
                    else toast.error(r.error);
                    setActive(null);
                  })
                }
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}
        <ul className="divide-y text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                {s.name}
                <Badge variant={s.status === "ok" ? "secondary" : "outline"}>
                  {STATUS[s.status] ?? s.status}
                </Badge>
                {!s.enabled ? (
                  <span className="text-xs text-muted-foreground">
                    disabled (enable on Sources)
                  </span>
                ) : null}
              </span>
              <span className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending || active !== null}
                  onClick={() =>
                    start(async () => {
                      const r = await checkSiteSession(s.id);
                      if (r.ok) toast.success(r.message ?? "OK");
                      else toast.error(r.error);
                    })
                  }
                >
                  Check session
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || active !== null}
                  onClick={() =>
                    start(async () => {
                      const r = await startLogin(s.id);
                      if (r.ok)
                        setActive({
                          site: s.id,
                          ...loginStep(remote, {
                            viewerUrl: r.viewerUrl ?? null,
                            message: r.message ?? "",
                          }),
                        });
                      else if ("browserMissing" in r && r.browserMissing) setBrowserMissing(true);
                      else toast.error(r.error);
                    })
                  }
                >
                  <LogIn aria-hidden /> Log in
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <Button variant="destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden /> Delete browser profile
        </Button>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete the browser profile?</DialogTitle>
              <DialogDescription>
                This removes the isolated profile and logs you out of every site. Logged-in sources
                stop until you log in again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteBrowserProfile();
                    if (r.ok) toast.success(r.message ?? "Deleted");
                    else toast.error(r.error);
                    setConfirmDelete(false);
                  })
                }
              >
                Delete profile
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
