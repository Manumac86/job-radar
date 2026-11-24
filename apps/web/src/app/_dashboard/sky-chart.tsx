// Tonight's sky (surface brief src-app, signature move): open offers plotted as stars.
// x = how long ago the offer was first seen (today on the right), y = score; the dot's diameter
// follows the fixed magnitude ramp and shortlisted offers wear the flashlight ring. Every star is
// a link to its offer; the brightest are named in the atlas voice.
import type { SkyOffer } from "@job-radar/db";
import Link from "next/link";

const W = 760;
const H = 300;
// The right margin holds star names; the magnitude key sits under the chart, in HTML.
const PAD = { top: 16, right: 120, bottom: 30, left: 84 };
const R = { strong: 6, possible: 4, weak: 2 } as const;
const BANDS = [
  { at: 80, label: "Strong" },
  { at: 60, label: "Possible" },
];

/** A stable horizontal jitter inside the day, so offers seen together do not stack. */
const jitter = (id: number) => (((id * 2654435761) >>> 0) % 1000) / 1000 - 0.5;

export function SkyChart({ offers, days, now }: { offers: SkyOffer[]; days: number; now: Date }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const minScore = 20;
  const ageOf = (o: SkyOffer) =>
    Math.max(0, Math.floor((now.getTime() - o.firstSeenAt.getTime()) / 86_400_000));
  // The time axis spans the offers actually charted (at least a week), so stars spread out.
  const span = Math.min(days, Math.max(7, ...offers.map((o) => ageOf(o) + 1)));
  const xOfDay = (d: number) => PAD.left + plotW - ((d + 0.5) / span) * plotW;
  const x = (o: SkyOffer) =>
    PAD.left + plotW - ((Math.min(span - 1, ageOf(o)) + 0.5 + jitter(o.id) * 0.8) / span) * plotW;
  const y = (score: number) =>
    PAD.top + plotH - ((Math.max(minScore, score) - minScore) / (100 - minScore)) * plotH;

  // Faint first, brightest last, so the strong stars sit on top.
  const order = { weak: 0, possible: 1, strong: 2 } as const;
  const stars = [...offers].sort(
    (a, b) => order[a.scoreClass] - order[b.scoreClass] || a.score - b.score,
  );

  // Name the brightest five that have room for a label.
  const named: { o: SkyOffer; x: number; y: number }[] = [];
  for (const o of [...offers].sort((a, b) => b.score - a.score)) {
    if (named.length >= 5 || o.scoreClass !== "strong") break;
    const px = x(o);
    const py = y(o.score);
    if (named.some((n) => Math.abs(n.y - py) < 16 && Math.abs(n.x - px) < 150)) continue;
    named.push({ o, x: px, y: py });
  }

  const ticks = [...new Set([0, Math.round((span - 1) / 2), span - 1])];
  const tickLabel = (d: number) => (d === 0 ? "today" : `${d} d ago`);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full text-foreground"
        role="img"
        aria-label={`${offers.length} open scored offers from the last ${span} days, by score and age`}
        data-testid="sky-chart"
      >
        {/* Coordinate frame: a ruled plate with tick marks, thresholds as declination lines. */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
        />
        {[60, 80].map((s) => (
          <line
            key={s}
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={y(s)}
            y2={y(s)}
            stroke="currentColor"
            strokeOpacity={0.18}
          />
        ))}
        {[30, 40, 50, 60, 70, 80, 90].map((s) => (
          <line
            key={s}
            x1={PAD.left}
            x2={PAD.left + (s % 20 === 0 ? 7 : 4)}
            y1={y(s)}
            y2={y(s)}
            stroke="currentColor"
            strokeOpacity={0.5}
          />
        ))}
        {Array.from({ length: span }, (_, d) => d).map((d) => (
          <line
            key={d}
            x1={xOfDay(d)}
            x2={xOfDay(d)}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH - (d % 7 === 0 ? 7 : 4)}
            stroke="currentColor"
            strokeOpacity={0.5}
          />
        ))}
        {ticks.map((d) => (
          <text
            key={d}
            x={xOfDay(d)}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[12px]"
          >
            {tickLabel(d)}
          </text>
        ))}
        {BANDS.map((b) => (
          <text
            key={b.at}
            x={PAD.left - 10}
            y={y(b.at) + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[12px]"
          >
            {b.label} {b.at}
          </text>
        ))}
        <text
          x={PAD.left - 10}
          y={y(100) + 4}
          textAnchor="end"
          className="fill-muted-foreground text-[12px]"
        >
          100
        </text>

        {stars.map((o) => {
          const cx = x(o);
          const cy = y(o.score);
          const r = R[o.scoreClass];
          return (
            <Link
              key={o.id}
              href={`/offers/${o.id}`}
              aria-label={`${o.companyName}: ${o.title}, score ${o.score}`}
              className="group outline-none"
            >
              <title>{`${o.title} · ${o.companyName} · ${o.score}`}</title>
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                className={
                  o.scoreClass === "strong"
                    ? "fill-strong"
                    : o.scoreClass === "possible"
                      ? "fill-possible"
                      : "fill-weak"
                }
              />
              {o.shortlisted ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 4}
                  fill="none"
                  className="stroke-flashlight"
                  strokeWidth={1.5}
                />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={r + 7}
                fill="none"
                className="stroke-flashlight opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                strokeWidth={1}
              />
            </Link>
          );
        })}

        {named.map(({ o, x: px, y: py }) => {
          // Names stay inside the frame: near the right edge they sit left of their star.
          const left = px + 11 + o.companyName.length * 6.6 > PAD.left + plotW - 4;
          return (
            <text
              key={o.id}
              x={left ? px - 11 : px + 11}
              y={py + 4}
              textAnchor={left ? "end" : "start"}
              className="pointer-events-none fill-foreground font-serif text-[13px] italic"
            >
              {o.companyName}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {(
          [
            ["strong", "Strong 80+"],
            ["possible", "Possible 60+"],
            ["weak", "Weak"],
          ] as const
        ).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-2">
            <span className="inline-grid size-3 place-items-center" aria-hidden>
              <span
                className={`rounded-full ${k === "strong" ? "bg-strong" : k === "possible" ? "bg-possible" : "bg-weak"}`}
                style={{ width: R[k] * 2, height: R[k] * 2 }}
              />
            </span>
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-full border-[1.5px] border-flashlight" aria-hidden />
          Shortlisted
        </span>
        <span className="sr-only">Each star is an open offer; larger stars score higher.</span>
      </figcaption>
    </figure>
  );
}
