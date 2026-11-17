// pnpm db:restore <backup-file> [--yes]
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { restoreDatabase } from "../backup";
import { databasePath } from "../paths";

export async function confirm(question: string, input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: pnpm db:restore <backup-file> [--yes]");
    return 2;
  }
  const backup = resolve(process.env["INIT_CWD"] ?? process.cwd(), file);
  const target = databasePath();
  console.log(`This replaces ${target}\nwith ${backup}.\nStop the worker and web app first.`);
  const ok = args.includes("--yes") || (await confirm('Type "yes" to continue: '));
  if (!ok) {
    console.log("Restore cancelled.");
    return 1;
  }
  const result = restoreDatabase(backup, target);
  console.log(`Restored from ${result.restoredFrom}.`);
  if (result.previousSavedAs) console.log(`Previous database saved as ${result.previousSavedAs}.`);
  return 0;
}

process.exitCode = await main();
