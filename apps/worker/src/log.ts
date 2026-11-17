// Minimal structured logger. Every registered secret value is masked before output,
// so tokens and passwords can never reach the logs (local-operation spec).
const secrets = new Set<string>();

export function registerSecret(value: string | undefined | null): void {
  if (value && value.length >= 4) secrets.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join("[redacted]");
  return out;
}

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = order[(process.env["LOG_LEVEL"] as Level | undefined) ?? "info"] ?? 20;
let sink: (line: string) => void = (line) => process.stderr.write(line + "\n");

/** Tests capture log output through this. */
export function setLogSink(fn: (line: string) => void): void {
  sink = fn;
}

function write(level: Level, msg: string, data?: Record<string, unknown>): void {
  if (order[level] < threshold) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(data ?? {}) });
  sink(redact(line));
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
};

export function errorMessage(err: unknown): string {
  return redact(err instanceof Error ? err.message : String(err));
}
