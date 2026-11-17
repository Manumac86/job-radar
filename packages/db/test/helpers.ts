import { openDatabase, type Db } from "../src/client";
import { insertOffer, upsertSource, upsertCompany, type NewOffer } from "../src/queries/offers";

export function memoryDb(): Db {
  return openDatabase({ path: ":memory:" });
}

export function seedSource(
  db: Db,
  id = "greenhouse",
  type: "greenhouse" | "remoteok" = "greenhouse",
) {
  return upsertSource(db, { id, type, name: id, enabled: true });
}

export function seedOffer(db: Db, overrides: Partial<NewOffer> = {}) {
  const company = upsertCompany(db, { name: "Acme AI", normalizedName: "acme ai" });
  return insertOffer(db, {
    sourceId: "greenhouse",
    externalId: String(Math.random()),
    sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
    title: "Senior AI Engineer",
    normalizedTitle: "senior ai engineer",
    companyId: company.id,
    companyName: company.name,
    ...overrides,
  });
}
