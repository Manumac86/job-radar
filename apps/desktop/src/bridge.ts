// The narrow API the app window gets (design D3). Shared by preload and main.

export interface DesktopInfo {
  version: string;
  dataDir: string;
  logsDir: string;
  launchAtLogin: boolean;
  claude: { path: string | null; configured: string | null; source: string | null };
  browserInstalled: boolean;
  /** "Google Chrome" when installed (Google sign-in works there), else "Chromium". */
  browser: "Google Chrome" | "Chromium";
  /** Playwright's Chromium is on disk (removable while Chrome is used). */
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

export const CHANNELS = {
  getInfo: "desktop:get-info",
  setLaunchAtLogin: "desktop:set-launch-at-login",
  setClaudePath: "desktop:set-claude-path",
  installBrowser: "desktop:install-browser",
  removeChromium: "desktop:remove-chromium",
  browserProgress: "desktop:browser-progress",
  restart: "desktop:restart",
  openLogs: "desktop:open-logs",
} as const;
