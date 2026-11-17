import type { Preferences } from "@job-radar/core";
import { getSource, upsertSource, type Db } from "@job-radar/db";
import type { SourceAdapter } from "@job-radar/sources";

/**
 * Ensures one source row per adapter. New sources start disabled (logged-in ones always),
 * except where preferences.yaml enables them (e.g. ycombinator.enabled). Existing rows keep
 * the owner's choices.
 */
export function syncSources(
  db: Db,
  adapters: Record<string, SourceAdapter>,
  prefs: Preferences | null,
): void {
  for (const adapter of Object.values(adapters)) {
    if (adapter.type === "fake") continue;
    const exists = getSource(db, adapter.type);
    const pref = prefs?.sources[adapter.type] ?? {};
    const pollHours = typeof pref["poll_hours"] === "number" ? pref["poll_hours"] : null;
    upsertSource(db, {
      id: adapter.type,
      type: adapter.type as Parameters<typeof upsertSource>[1]["type"],
      name: adapter.label,
      requiresLogin: adapter.requiresLogin ?? false,
      ...(exists
        ? {}
        : {
            enabled: !adapter.requiresLogin && pref["enabled"] === true,
            // Logged-in sources start logged out until the owner logs in (Settings → Sessions).
            ...(adapter.requiresLogin ? { status: "logged_out" as const } : {}),
            intervalMinutes: pollHours ? pollHours * 60 : adapter.defaultIntervalMinutes,
          }),
    });
  }
}
