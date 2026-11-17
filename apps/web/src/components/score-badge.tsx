import { cn } from "@/lib/utils";

const STYLES = {
  strong: "bg-strong/15 text-strong ring-strong/30",
  possible: "bg-possible/15 text-possible ring-possible/30",
  weak: "bg-weak/15 text-weak ring-weak/30",
} as const;

export function ScoreBadge({
  score,
  scoreClass,
  status,
}: {
  score: number | null;
  scoreClass: "strong" | "possible" | "weak" | null;
  status?: string;
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
    return <span className="text-xs text-muted-foreground">{label}</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-11 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1",
        STYLES[scoreClass],
      )}
      title={`${scoreClass} match`}
    >
      {score}
    </span>
  );
}
