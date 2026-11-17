// First-run import of an existing Job Radar folder (desktop-app spec, "App data location and
// first-run import"; design D7). The source is only read, never changed.
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { backup } from "node:sqlite";
import { join } from "node:path";

export const DB_FILE = join("db", "radar.sqlite");

export function needsFirstRun(dataDir: string): boolean {
  return !existsSync(join(dataDir, DB_FILE));
}

export interface ImportSource {
  data: string;
  secrets: string | null;
}

/** Accepts the repository folder (with data/ and secrets/) or a data folder itself. */
export function resolveImportSource(folder: string): ImportSource | null {
  if (existsSync(join(folder, "data", DB_FILE)))
    return {
      data: join(folder, "data"),
      secrets: existsSync(join(folder, "secrets")) ? join(folder, "secrets") : null,
    };
  if (existsSync(join(folder, DB_FILE))) return { data: folder, secrets: null };
  return null;
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  copied?: string[];
}

export async function importJobRadar(
  folder: string,
  target: { dataDir: string; secretsDir: string },
  deps: { isRunning: () => Promise<boolean>; now?: () => Date },
): Promise<ImportResult> {
  const source = resolveImportSource(folder);
  if (!source)
    return {
      ok: false,
      error: `No Job Radar data found in ${folder} (expected data/db/radar.sqlite)`,
    };
  if (await deps.isRunning())
    return {
      ok: false,
      error:
        "Another Job Radar is running on this data. Stop it first (for Docker: `docker compose down`), then import again.",
    };
  if (!needsFirstRun(target.dataDir))
    return {
      ok: false,
      error: "This app already has data; import is only for a new installation.",
    };

  const copied: string[] = [];
  mkdirSync(join(target.dataDir, "db"), { recursive: true });
  // Consistent snapshot even if something writes meanwhile; WAL content is included.
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(source.data, DB_FILE), { readOnly: true });
  try {
    await backup(db, join(target.dataDir, DB_FILE));
  } finally {
    db.close();
  }
  copied.push("database");

  for (const dir of ["profile", "browser-profile", "backups"]) {
    const from = join(source.data, dir);
    if (!existsSync(from)) continue;
    cpSync(from, join(target.dataDir, dir), {
      recursive: true,
      errorOnExist: false,
      // Browser lock files belong to a running Chromium.
      filter: (src) => !/Singleton(Lock|Socket|Cookie)$/.test(src),
    });
    copied.push(dir);
  }

  if (source.secrets) {
    mkdirSync(target.secretsDir, { recursive: true, mode: 0o700 });
    chmodSync(target.secretsDir, 0o700);
    for (const name of readdirSync(source.secrets)) {
      const from = join(source.secrets, name);
      if (!statSync(from).isFile() || name.startsWith(".")) continue;
      const to = join(target.secretsDir, name);
      cpSync(from, to);
      chmodSync(to, 0o600);
    }
    copied.push("secrets");
  }

  writeFileSync(
    join(target.dataDir, "import.json"),
    `${JSON.stringify({ from: folder, at: (deps.now?.() ?? new Date()).toISOString(), copied }, null, 2)}\n`,
  );
  return { ok: true, copied };
}
