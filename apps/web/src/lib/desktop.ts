"use client";

import { useEffect, useState } from "react";

/** Mirror of the macOS app's preload bridge (apps/desktop/src/bridge.ts). */
export interface DesktopInfo {
  version: string;
  dataDir: string;
  logsDir: string;
  launchAtLogin: boolean;
  claude: { path: string | null; configured: string | null; source: string | null };
  browserInstalled: boolean;
  browser: "Google Chrome" | "Chromium";
  chromiumDownloaded: boolean;
}

export interface DesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  setLaunchAtLogin(on: boolean): Promise<boolean>;
  setClaudePath(
    path: string | null,
  ): Promise<{ ok: boolean; error?: string; path?: string | null }>;
  installBrowser(): Promise<{ ok: boolean; error?: string }>;
  removeChromium(): Promise<{ ok: boolean }>;
  onBrowserProgress(cb: (line: string) => void): () => void;
  restart(): Promise<void>;
  openLogs(): Promise<void>;
}

/** The bridge when running inside the macOS app; null in a normal browser (Docker, dev). */
const readBridge = () =>
  (window as unknown as { jobRadarDesktop?: DesktopBridge }).jobRadarDesktop ?? null;

/** The bridge when running inside the macOS app; null in a normal browser (Docker, dev). */
export function useDesktopBridge(): DesktopBridge | null {
  // Null on the server and during hydration, so the markup matches; read after mount.
  const [bridge, setBridge] = useState<DesktopBridge | null>(null);
  useEffect(() => {
    const b = readBridge();
    if (!b) return;
    const t = setTimeout(() => setBridge(b), 0);
    return () => clearTimeout(t);
  }, []);
  return bridge;
}
