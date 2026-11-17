import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(1),
  ats: z.enum(["greenhouse", "lever", "ashby"]),
  slug: z.string().min(1),
  website: z.string().optional(),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});
export const companiesFileSchema = z.object({ companies: z.array(companySchema).default([]) });
export type CompanyEntry = z.infer<typeof companySchema>;

export function loadCompanies(dataDir: string): CompanyEntry[] {
  const file = join(dataDir, "profile", "companies.yaml");
  if (!existsSync(file)) return [];
  const parsed = companiesFileSchema.safeParse(parse(readFileSync(file, "utf8")) ?? {});
  if (!parsed.success) {
    throw new Error(
      `companies.yaml is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data.companies.filter((c) => c.enabled);
}
