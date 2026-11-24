import { cn } from "@/lib/utils";

type ScoreClass = "strong" | "possible" | "weak";

/**
 * Score as stellar magnitude (surface brief src-app, signature move): one fixed ramp on every
 * screen. The dot's diameter carries the class; the figure carries the score. Colour stays ink:
 * the only hue on a score is the flashlight ring, and only when the offer is selected.
 */
export const MAGNITUDE: Record<ScoreClass, { size: number; className: string; label: string }> = {
  strong: { size: 12, className: "bg-strong", label: "Strong match" },
  possible: { size: 8, className: "bg-possible", label: "Possible match" },
  weak: { size: 4, className: "bg-weak", label: "Weak match" },
};

export function MagnitudeDot({
  scoreClass,
  ringed = false,
  className,
}: {
  scoreClass: ScoreClass | null;
  ringed?: boolean;
  className?: string;
}) {
  const m = scoreClass ? MAGNITUDE[scoreClass] : null;
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)}
    >
      {m ? (
        <span
          className={cn("rounded-full", m.className)}
          style={{ width: m.size, height: m.size }}
        />
      ) : (
        <span className="size-2 rounded-full border border-dashed border-weak" />
      )}
      {ringed ? (
        <span className="absolute -inset-1 rounded-full border-[1.5px] border-flashlight" />
      ) : null}
    </span>
  );
}

export function ScoreBadge({
  score,
  scoreClass,
  status,
  ringed = false,
  size = "md",
  stacked = false,
}: {
  score: number | null;
  scoreClass: ScoreClass | null;
  status?: string;
  ringed?: boolean;
  size?: "md" | "lg";
  /** Narrow columns (the phone offers list): a status label goes under the dot. */
  stacked?: boolean;
}) {
  if (score === null || !scoreClass) {
    const label =
      status === "scoring_failed"
        ? "Failed"
        : status === "not_scored"
          ? "—"
          : status === "scoring"
            ? "Scoring…"
            : "Awaiting";
    return (
      <span
        className={cn(
          "inline-flex text-xs text-muted-foreground",
          stacked
            ? "flex-col items-start gap-1 text-[0.6875rem] leading-none"
            : "items-center gap-2",
        )}
      >
        <MagnitudeDot scoreClass={null} />
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2"
      title={MAGNITUDE[scoreClass].label}
      data-score-class={scoreClass}
    >
      <MagnitudeDot scoreClass={scoreClass} ringed={ringed} />
      <span
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-2xl tracking-tight" : "text-sm",
          scoreClass === "weak" && "text-muted-foreground",
        )}
      >
        {score}
      </span>
    </span>
  );
}
