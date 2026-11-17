import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { registerSecret } from "./log";

/** Reads secrets/<name> (git-ignored). The value is registered for log redaction. */
export function readSecretFile(dir: string, name: string): string | null {
  const file = join(dir, basename(name)); // no path traversal out of secrets/
  if (!existsSync(file)) return null;
  const value = readFileSync(file, "utf8").trim();
  if (!value) return null;
  registerSecret(value);
  return value;
}
