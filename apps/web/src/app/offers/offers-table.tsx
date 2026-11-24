"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE_CLASSES, STATUS_LABELS, type OfferStatus } from "@/lib/offer-status";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ENGAGEMENT_LABELS,
  formatRate,
  formatRelative,
  REMOTE_LABELS,
  type RateFields,
} from "@/lib/format";
import { OfferLink } from "./offer-link";

export interface OfferRow extends RateFields {
  id: number;
  title: string;
  companyName: string;
  score: number | null;
  scoreClass: "strong" | "possible" | "weak" | null;
  scoreStatus: string;
  sourceId: string;
  postedAt: string;
  engagementType: string;
  remotePolicy: string;
  triage: string;
  status: OfferStatus;
  /** Pipeline stage label; empty without an application. */
  pipeline: string;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, OfferRow>();

function SortHeader({ label, sortKey }: { label: string; sortKey: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const current = params.get("sort") ?? "score";
  const dir = params.get("dir") ?? "desc";
  const next = new URLSearchParams(params.toString());
  const nextDir = current === sortKey && dir === "desc" ? "asc" : "desc";
  next.set("sort", sortKey);
  next.set("dir", nextDir);
  const Icon = current !== sortKey ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link
      href={`${pathname}?${next.toString()}`}
      scroll={false}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      <Icon className="size-3.5" aria-hidden />
    </Link>
  );
}

const columns = helper.columns([
  helper.accessor("score", {
    header: () => <SortHeader label="Score" sortKey="score" />,
    cell: (info) => (
      <ScoreBadge
        score={info.row.original.score}
        scoreClass={info.row.original.scoreClass}
        status={info.row.original.scoreStatus}
      />
    ),
  }),
  helper.accessor("title", {
    header: () => <SortHeader label="Offer" sortKey="title" />,
    cell: (info) => {
      const o = info.row.original;
      return (
        <div className="min-w-56">
          <OfferLink
            id={o.id}
            className="font-display text-[1.0625rem] leading-[1.2] font-normal decoration-flashlight hover:underline"
          >
            {o.title}
          </OfferLink>
          <div className="text-xs leading-4 text-muted-foreground">
            {o.companyName} · {ENGAGEMENT_LABELS[o.engagementType] ?? o.engagementType} ·{" "}
            {REMOTE_LABELS[o.remotePolicy] ?? o.remotePolicy}
          </div>
        </div>
      );
    },
  }),
  helper.display({
    id: "rate",
    header: () => <SortHeader label="Rate" sortKey="rate" />,
    cell: (info) => (
      <span
        className={
          info.row.original.rateUnknown
            ? "whitespace-nowrap text-sm text-muted-foreground"
            : "whitespace-nowrap text-sm font-medium tabular-nums"
        }
      >
        {formatRate(info.row.original)}
      </span>
    ),
  }),
  helper.accessor("sourceId", {
    header: "Source",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
  helper.accessor("postedAt", {
    header: () => <SortHeader label="Posted" sortKey="posted" />,
    cell: (info) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatRelative(new Date(info.getValue()))}
      </span>
    ),
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const s = info.getValue();
      return (
        <Badge variant="outline" className={STATUS_BADGE_CLASSES[s]} data-testid="offer-status">
          {STATUS_LABELS[s]}
        </Badge>
      );
    },
  }),
  helper.accessor("pipeline", {
    header: "Pipeline",
    cell: (info) => (
      <span className="whitespace-nowrap text-sm" data-testid="offer-pipeline">
        {info.getValue()}
      </span>
    ),
  }),
]);

export function OffersTable({
  data,
  total,
  page,
  pageSize,
}: {
  data: OfferRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const table = useTable({ features, columns, data });
  const params = useSearchParams();
  const pathname = usePathname();
  const pageHref = (p: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(p));
    return `${pathname}?${next.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="rounded-md border bg-card">
      {/* Below md: one ruled two-line entry per offer instead of a clipped wide table. */}
      <ol className="divide-y md:hidden" aria-label="Offers">
        {data.length ? (
          data.map((o) => (
            <li key={o.id} className="flex gap-3 px-3 py-2.5">
              <div className="w-14 shrink-0 pt-0.5">
                <ScoreBadge
                  score={o.score}
                  scoreClass={o.scoreClass}
                  status={o.scoreStatus}
                  stacked
                />
              </div>
              <div className="min-w-0 flex-1">
                <OfferLink
                  id={o.id}
                  className="font-display text-[1.0625rem] leading-[1.2] font-normal decoration-flashlight hover:underline"
                >
                  {o.title}
                </OfferLink>
                <div className="truncate text-xs leading-4 text-muted-foreground">
                  {o.companyName} · {ENGAGEMENT_LABELS[o.engagementType] ?? o.engagementType}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span
                    className={o.rateUnknown ? "text-muted-foreground" : "font-medium tabular-nums"}
                  >
                    {formatRate(o)}
                  </span>
                  <Badge variant="outline" className={STATUS_BADGE_CLASSES[o.status]}>
                    {STATUS_LABELS[o.status]}
                  </Badge>
                  {o.pipeline ? <span className="text-muted-foreground">{o.pipeline}</span> : null}
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            No offers match these filters.
          </li>
        )}
      </ol>
      <Table data-testid="offers-table" className="hidden md:table">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.id === "rate" ? "text-right" : undefined}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-testid="offer-row">
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    // Cells default to nowrap; let long titles wrap so the table fits the page.
                    className={
                      cell.column.id === "title"
                        ? "w-full whitespace-normal"
                        : cell.column.id === "rate"
                          ? "text-right"
                          : undefined
                    }
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                No offers match these filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild disabled={page <= 1}>
              <Link href={pageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button variant="outline" size="sm" asChild disabled={page >= pages}>
              <Link href={pageHref(Math.min(pages, page + 1))}>Next</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
