"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface IngestPoint {
  day: string;
  sourceId: string;
  count: number;
}

/**
 * Offers ingested per day, stacked by source. Sources keep a fixed color slot (by their
 * order in the source list, never by rank); beyond 8 sources the rest fold into "Other".
 */
export function IngestChart({
  points,
  sources,
  days: allDays,
}: {
  points: IngestPoint[];
  sources: { id: string; name: string }[];
  /** Every day of the period, so empty days show as gaps instead of stretching bars. */
  days: string[];
}) {
  const [asTable, setAsTable] = useState(false);
  const slots = sources.slice(0, 8);
  const keyOf = (id: string) => (slots.some((s) => s.id === id) ? id : "other");
  const used = [...new Set(points.map((p) => keyOf(p.sourceId)))];
  const config: ChartConfig = Object.fromEntries([
    ...slots.map((s, i) => [s.id, { label: s.name, color: `var(--series-${i + 1})` }]),
    ["other", { label: "Other", color: "var(--series-other)" }],
  ]);
  const days = allDays;
  const data = days.map((day) => {
    const row: Record<string, string | number> = { day };
    for (const p of points.filter((x) => x.day === day)) {
      const k = keyOf(p.sourceId);
      row[k] = Number(row[k] ?? 0) + p.count;
    }
    return row;
  });
  const keys = [...slots.map((s) => s.id), "other"].filter((k) => used.includes(k));
  const label = (k: string) => String(config[k]?.label ?? k);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "View as chart" : "View as table"}
        </Button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto">
          <table
            className="w-full text-sm max-md:[&_td:not(:first-child)]:pl-3 max-md:[&_th:not(:first-child)]:pl-3"
            aria-label="Offers ingested per day by source"
          >
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Day</th>
                {keys.map((k) => (
                  <th key={k} className="py-1 text-right font-medium">
                    {label(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row["day"])} className="border-t">
                  <td className="py-1 tabular-nums">{row["day"]}</td>
                  {keys.map((k) => (
                    <td key={k} className="py-1 text-right tabular-nums">
                      {row[k] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartContainer config={config} className="h-64 w-full">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap={4}>
            <CartesianGrid vertical={false} strokeOpacity={0.4} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="a"
                fill={`var(--color-${k})`}
                stroke="var(--background)"
                strokeWidth={1}
                radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
