// "Back to offers" (job-dashboard spec): the offers list's query travels to the offer detail
// in `list`, and the detail links back to /offers with it. The path is always /offers, so a
// crafted `list` can only change the list's own filters.

/** Link from the offers list to an offer, carrying the list's query string. */
export function offerHref(id: number, listQuery: string): string {
  return listQuery ? `/offers/${id}?list=${encodeURIComponent(listQuery)}` : `/offers/${id}`;
}

/** Where "Back to offers" goes: the list with its query, or the default list. */
export function backToOffersHref(list: string | string[] | undefined): string {
  const query = new URLSearchParams(typeof list === "string" ? list : "").toString();
  return query ? `/offers?${query}` : "/offers";
}
