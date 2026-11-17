// The first-run dialog (desktop-app spec, "App data location and first-run import").
import { dialog } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";
import { importJobRadar, needsFirstRun } from "./import";
import { isJobRadar } from "./ports";

export type FirstRunChoice = "import" | "fresh" | "quit";

/** Button index → choice, for the three-button dialog below. */
export function choiceFor(response: number): FirstRunChoice {
  return response === 0 ? "import" : response === 1 ? "fresh" : "quit";
}

/** Returns false when the owner chose to quit. */
export async function runFirstRunIfNeeded(o: {
  dataDir: string;
  secretsDir: string;
  workerPort: number;
  lastImportFrom: string | null;
  onImported: (from: string) => void;
}): Promise<boolean> {
  if (!needsFirstRun(o.dataDir)) return true;
  for (;;) {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Import from a Job Radar folder…", "Start fresh", "Quit"],
      defaultId: 0,
      cancelId: 2,
      message: "Welcome to Job Radar",
      detail:
        "Import your offers, applications, profile, browser sessions and secrets from your Job Radar folder (the repository), or start with the seed profile. The original folder is not changed.",
    });
    const choice = choiceFor(response);
    if (choice !== "import") return choice === "fresh";
    const picked = await dialog.showOpenDialog({
      title: "Choose your Job Radar folder",
      defaultPath: o.lastImportFrom ?? join(homedir(), "Projects", "job-radar"),
      properties: ["openDirectory"],
    });
    const folder = picked.filePaths[0];
    if (picked.canceled || !folder) continue;
    const res = await importJobRadar(
      folder,
      { dataDir: o.dataDir, secretsDir: o.secretsDir },
      { isRunning: () => isJobRadar(o.workerPort) },
    );
    if (res.ok) {
      o.onImported(folder);
      await dialog.showMessageBox({
        type: "info",
        message: "Imported",
        detail: `Copied: ${res.copied?.join(", ")}. Keep the Docker stack stopped: run only one Job Radar.`,
      });
      return true;
    }
    await dialog.showMessageBox({
      type: "warning",
      message: "Import failed",
      detail: res.error ?? "",
    });
  }
}
