// Where the macOS app keeps everything (desktop-app spec, "App data location"; design D4).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  /** ~/Library/Application Support/Job Radar */
  root: string;
  data: string;
  secrets: string;
  logs: string;
  browsers: string;
  config: string;
}

export function appPaths(home = homedir()): AppPaths {
  const root = join(home, "Library", "Application Support", "Job Radar");
  return {
    root,
    data: join(root, "data"),
    secrets: join(root, "secrets"),
    logs: join(root, "data", "logs"),
    browsers: join(root, "browsers"),
    config: join(root, "desktop.json"),
  };
}

export interface DesktopConfig {
  webPort: number;
  workerPort: number;
  /** Path to the owner's `claude` CLI; null = discover it. */
  claudePath: string | null;
  launchAtLogin: boolean;
  /** Advanced: use another data folder (documented, not in the UI). */
  dataDir: string | null;
  /** Folder last imported from, offered again as the default. */
  lastImportFrom: string | null;
}

export const DEFAULT_CONFIG: DesktopConfig = {
  webPort: 3300,
  workerPort: 4000,
  claudePath: null,
  launchAtLogin: false,
  dataDir: null,
  lastImportFrom: null,
};

const port = (v: unknown, fallback: number) =>
  Number.isInteger(v) && (v as number) >= 1024 && (v as number) <= 65535 ? (v as number) : fallback;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Reads desktop.json; unknown or invalid values fall back to the defaults. */
export function loadConfig(paths: AppPaths): DesktopConfig {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(paths.config, "utf8")) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return {
    webPort: port(raw["webPort"], DEFAULT_CONFIG.webPort),
    workerPort: port(raw["workerPort"], DEFAULT_CONFIG.workerPort),
    claudePath: str(raw["claudePath"]),
    launchAtLogin: raw["launchAtLogin"] === true,
    dataDir: str(raw["dataDir"]),
    lastImportFrom: str(raw["lastImportFrom"]),
  };
}

export function saveConfig(paths: AppPaths, update: Partial<DesktopConfig>): DesktopConfig {
  const next = { ...loadConfig(paths), ...update };
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(paths.config, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

/** Creates the folders; secrets is readable only by the owner (0700). */
export function ensureDirs(paths: AppPaths, config: DesktopConfig): { data: string } {
  const data = config.dataDir ?? paths.data;
  for (const d of [paths.root, data, join(data, "logs"), paths.browsers])
    mkdirSync(d, { recursive: true });
  if (!existsSync(paths.secrets)) mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  chmodSync(paths.secrets, 0o700);
  return { data };
}
