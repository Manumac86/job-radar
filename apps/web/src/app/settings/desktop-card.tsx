"use client";

import { Download, FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDesktopBridge, type DesktopBridge, type DesktopInfo } from "@/lib/desktop";

/** Downloads Chromium through the macOS app, which asks for confirmation first. */
export function useBrowserInstall(bridge: DesktopBridge | null, onDone?: () => void) {
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const install = () =>
    start(async () => {
      if (!bridge) return;
      const off = bridge.onBrowserProgress(setProgress);
      try {
        const r = await bridge.installBrowser();
        if (r.ok) {
          toast.success("Chromium installed");
          onDone?.();
        } else if (r.error !== "Cancelled") toast.error(r.error ?? "Download failed");
      } finally {
        off();
        setProgress(null);
      }
    });
  return { install, pending, progress };
}

/** Shown only inside the macOS app (desktop-app spec). */
export function DesktopCard() {
  const bridge = useDesktopBridge();
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [claudePath, setClaudePath] = useState("");
  const [pending, start] = useTransition();
  const load = useCallback(() => {
    void bridge?.getInfo().then((i) => {
      setInfo(i);
      setClaudePath(i.claude.configured ?? "");
    });
  }, [bridge]);
  useEffect(load, [load]);
  const browser = useBrowserInstall(bridge, load);
  if (!bridge || !info) return null;

  return (
    <Card data-testid="desktop-card">
      <CardHeader>
        <CardTitle>Desktop</CardTitle>
        <CardDescription>
          Job Radar {info.version} for macOS. Data lives in <code>{info.dataDir}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="flex items-center gap-3">
          <Switch
            id="launch-at-login"
            checked={info.launchAtLogin}
            onCheckedChange={(on) =>
              start(async () => {
                const now = await bridge.setLaunchAtLogin(on);
                setInfo({ ...info, launchAtLogin: now });
              })
            }
          />
          <Label htmlFor="launch-at-login">Launch at login (starts in the menu bar)</Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="claude-path">Claude Code CLI</Label>
          <p className="text-muted-foreground" data-testid="claude-path-status">
            {info.claude.path
              ? `Using ${info.claude.path}${info.claude.source === "config" ? " (set here)" : " (found automatically)"}.`
              : "Claude Code CLI not found. Install it (npm install -g @anthropic-ai/claude-code), run `claude` once to log in, or set its path below."}
          </p>
          <div className="flex gap-2">
            <Input
              id="claude-path"
              value={claudePath}
              placeholder="Automatic (e.g. /Users/you/.local/bin/claude)"
              onChange={(e) => setClaudePath(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await bridge.setClaudePath(claudePath.trim() || null);
                  if (r.ok) {
                    toast.success("Saved. The worker restarted with this CLI.");
                    load();
                  } else toast.error(r.error ?? "Not saved");
                })
              }
            >
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Browser for logged-in sources</Label>
          <p className="text-muted-foreground" data-testid="desktop-browser">
            {info.browser === "Google Chrome"
              ? "Google Chrome, with its own isolated profile (separate from your everyday Chrome). Logins open in a normal Chrome window, so Google sign-in works."
              : info.browserInstalled
                ? "Chromium, with an isolated profile. Install Google Chrome to sign in with Google."
                : "Not installed. Install Google Chrome, or download Chromium (about 150 MB; Google sign-in may be refused there)."}
          </p>
          {info.browser === "Google Chrome" && info.chromiumDownloaded ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await bridge.removeChromium();
                  if (r.ok) {
                    toast.success("Downloaded Chromium removed");
                    load();
                  }
                })
              }
            >
              Remove downloaded Chromium
            </Button>
          ) : null}
          {!info.browserInstalled ? (
            <Button variant="outline" disabled={browser.pending} onClick={browser.install}>
              {browser.pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              {browser.pending ? (browser.progress ?? "Downloading…") : "Download Chromium"}
            </Button>
          ) : null}
        </div>

        <Button variant="ghost" size="sm" onClick={() => void bridge.openLogs()}>
          <FolderOpen aria-hidden /> Open logs folder
        </Button>
      </CardContent>
    </Card>
  );
}
