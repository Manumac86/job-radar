import { desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { profilesMeta } from "../schema";

export function recordProfileLoad(db: Db, entry: typeof profilesMeta.$inferInsert): void {
  db.insert(profilesMeta).values(entry).run();
}

export function lastSuccessfulProfileLoad(db: Db): Date | null {
  return (
    db
      .select({ at: profilesMeta.loadedAt })
      .from(profilesMeta)
      .where(eq(profilesMeta.status, "ok"))
      .orderBy(desc(profilesMeta.id))
      .get()?.at ?? null
  );
}
