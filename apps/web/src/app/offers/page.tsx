import { listOffers, listSources, listStages } from "@job-radar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { parseOfferFilters, type SearchParams } from "@/lib/offer-filters";
import { ImportOfferDialog } from "./import-dialog";
import { RescoreBanner } from "@/components/rescore-banner";
import { rescoreBanner } from "@/lib/learning";
import { OffersFilters } from "./offers-filters";
import { offerStatus, pipelineLabel } from "@/lib/offer-status";
import { OffersTable, type OfferRow } from "./offers-table";

export const metadata: Metadata = { title: "Offers" };

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseOfferFilters(sp);
  const { rows, total, appliedHidden } = listOffers(db(), filters);
  const sources = listSources(db()).map((s) => ({ id: s.id, name: s.name }));
  const stageLabels = Object.fromEntries(listStages(db()).map((s) => [s.key, s.label]));
  const data: OfferRow[] = rows.map((o) => ({
    id: o.id,
    title: o.title,
    companyName: o.companyName,
    score: o.score,
    scoreClass: o.scoreClass,
    scoreStatus: o.scoreStatus,
    rateUnknown: o.rateUnknown,
    compMin: o.compMin,
    compMax: o.compMax,
    compCurrency: o.compCurrency,
    compPeriod: o.compPeriod,
    sourceId: o.sourceId,
    postedAt: (o.postedAt ?? o.firstSeenAt).toISOString(),
    engagementType: o.engagementType,
    remotePolicy: o.remotePolicy,
    triage: o.triage,
    status: offerStatus(o.triage, o.applicationStage),
    pipeline: pipelineLabel(o.applicationStage, stageLabels),
  }));
  const rescore = rescoreBanner();
  return (
    <>
      <PageHeader
        title="Offers"
        description={`${total} offer${total === 1 ? "" : "s"} match these filters${appliedHidden ? ` (${appliedHidden} applied hidden)` : ""}.`}
        actions={<ImportOfferDialog />}
      />
      {rescore.suggested ? (
        <div className="mb-4">
          <RescoreBanner openOffers={rescore.openOffers} />
        </div>
      ) : null}
      <OffersFilters sources={sources} />
      <OffersTable data={data} total={total} page={filters.page} pageSize={filters.limit ?? 50} />
    </>
  );
}
