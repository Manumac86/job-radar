// The menu bar item (desktop-app spec, "Menu bar"; design D8), as plain data so it can be tested.

export interface StatusSummary {
  overall: "ok" | "paused" | "attention";
  llm: "ok" | "not_authenticated" | "unavailable" | "unknown";
  llmMessage: string | null;
  pausedUntil: string | null;
  attention: { id: string; name: string; status: string }[];
  unread: number;
  running: string[];
}

export type MenuItemModel =
  | { kind: "label"; label: string }
  | { kind: "separator" }
  | {
      kind: "action";
      id: "open" | "run-all" | "launch-at-login" | "restart" | "claude-help" | "quit";
      label: string;
      enabled?: boolean;
      checked?: boolean;
    };

export interface MenuModel {
  icon: "ok" | "attention" | "stopped";
  tooltip: string;
  items: MenuItemModel[];
}

const SOURCE_STATUS: Record<string, string> = {
  session_expired: "session expired",
  logged_out: "logged out",
  failing: "failing",
  stopped: "stopped",
};

export function buildMenuModel(input: {
  summary: StatusSummary | null;
  /** Supervisor problem, e.g. "Worker stopped". */
  stopped: string | null;
  launchAtLogin: boolean;
  starting?: boolean;
}): MenuModel {
  const { summary, stopped } = input;
  const items: MenuItemModel[] = [];
  let icon: MenuModel["icon"] = "ok";
  let tooltip: string;

  if (stopped) {
    icon = "stopped";
    tooltip = stopped;
    items.push({ kind: "label", label: stopped });
    items.push({ kind: "action", id: "restart", label: "Restart" });
  } else if (input.starting || !summary) {
    tooltip = "Job Radar is starting…";
    items.push({ kind: "label", label: "Starting…" });
  } else {
    if (summary.llm === "not_authenticated") {
      icon = "attention";
      items.push({ kind: "label", label: "Claude not logged in" });
      items.push({ kind: "action", id: "claude-help", label: "How to fix…" });
    } else if (summary.llm === "unavailable") {
      icon = "attention";
      items.push({ kind: "label", label: "Claude Code not available" });
      items.push({ kind: "action", id: "claude-help", label: "How to fix…" });
    }
    for (const s of summary.attention) {
      icon = "attention";
      items.push({ kind: "label", label: `${s.name}: ${SOURCE_STATUS[s.status] ?? s.status}` });
    }
    if (summary.pausedUntil && icon === "ok") {
      const until = new Date(summary.pausedUntil);
      items.push({
        kind: "label",
        label: `Scoring paused until ${until.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
      });
    }
    if (!items.length) items.push({ kind: "label", label: "Running" });
    if (summary.running.length)
      items.push({ kind: "label", label: `Running now: ${summary.running.join(", ")}` });
    items.push({
      kind: "label",
      label: summary.unread
        ? `${summary.unread} unread notification${summary.unread === 1 ? "" : "s"}`
        : "No unread notifications",
    });
    tooltip =
      icon === "attention"
        ? "Job Radar needs attention"
        : summary.unread
          ? `Job Radar: ${summary.unread} unread`
          : "Job Radar is running";
  }

  items.push({ kind: "separator" });
  items.push({ kind: "action", id: "open", label: "Open Job Radar" });
  items.push({
    kind: "action",
    id: "run-all",
    label: "Run all sources now",
    enabled: Boolean(summary) && !stopped,
  });
  items.push({ kind: "separator" });
  items.push({
    kind: "action",
    id: "launch-at-login",
    label: "Launch at login",
    checked: input.launchAtLogin,
  });
  items.push({ kind: "action", id: "quit", label: "Quit Job Radar" });
  return { icon, tooltip, items };
}
