import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";

/** Folder, inside the profile folder, that holds the CV variants (cv-variants design D1). */
export const CV_VARIANTS_DIR = "cvs";
export const MAX_VARIANTS = 8;
export const MAX_VARIANT_CHARS = 20_000;
/** Id used for "the master CV was sent" on applications. */
export const MASTER_CV_ID = "master";

/** A named version of the CV that stresses some experience; the master CV stays complete. */
export interface CvVariant {
  id: string;
  name: string;
  useFor: string;
  text: string;
}

export interface VariantsLoad {
  variants: CvVariant[];
  /** One line per skipped file; a bad variant never invalidates the profile. */
  errors: string[];
  /** Changes whenever any variant's name, use_for or text changes ("" with no variants). */
  hash: string;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function isVariantId(id: string): boolean {
  return ID.test(id) && id !== MASTER_CV_ID && id.length <= 40;
}

/** Kebab-case id from a name, e.g. "Tech Lead (startups)" → "tech-lead-startups". */
export function variantIdFrom(name: string): string {
  const id = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
  return id && id !== MASTER_CV_ID ? id : `cv-${id || "variant"}`;
}

/** Parses one variant file: front matter with name and use_for, then the CV in Markdown. */
export function parseVariant(
  id: string,
  raw: string,
): { ok: true; variant: CvVariant } | { ok: false; error: string } {
  const file = `${CV_VARIANTS_DIR}/${id}.md`;
  if (!isVariantId(id)) return { ok: false, error: `${file}: use a kebab-case file name` };
  const m = FRONT_MATTER.exec(raw);
  if (!m) return { ok: false, error: `${file}: missing the --- name / use_for --- header` };
  let meta: unknown;
  try {
    meta = parse(m[1] ?? "");
  } catch (e) {
    return { ok: false, error: `${file}: header is not valid YAML (${(e as Error).message})` };
  }
  const rec = (meta ?? {}) as Record<string, unknown>;
  const name = typeof rec["name"] === "string" ? rec["name"].trim() : "";
  const useFor = typeof rec["use_for"] === "string" ? rec["use_for"].trim() : "";
  const text = (m[2] ?? "").trim();
  if (!name) return { ok: false, error: `${file}: name is missing` };
  if (!useFor) return { ok: false, error: `${file}: use_for is missing` };
  if (!text) return { ok: false, error: `${file}: the CV text is empty` };
  if (text.length > MAX_VARIANT_CHARS)
    return { ok: false, error: `${file}: longer than ${MAX_VARIANT_CHARS} characters` };
  return { ok: true, variant: { id, name: name.slice(0, 80), useFor: useFor.slice(0, 200), text } };
}

export function serializeVariant(v: Omit<CvVariant, "id">): string {
  return `---\n${stringify({ name: v.name, use_for: v.useFor }, { lineWidth: 0 })}---\n\n${v.text.trim()}\n`;
}

/** Loads every variant in `<profileDir>/cvs/`, sorted by id; invalid files are skipped. */
export function loadVariants(profileDir: string): VariantsLoad {
  const dir = join(/*turbopackIgnore: true*/ profileDir, CV_VARIANTS_DIR);
  if (!existsSync(dir)) return { variants: [], errors: [], hash: "" };
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const variants: CvVariant[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const id = f.slice(0, -3);
    if (variants.length >= MAX_VARIANTS) {
      errors.push(`${CV_VARIANTS_DIR}/${f}: ignored, at most ${MAX_VARIANTS} variants`);
      continue;
    }
    const r = parseVariant(id, readFileSync(join(/*turbopackIgnore: true*/ dir, f), "utf8"));
    if (r.ok) variants.push(r.variant);
    else errors.push(r.error);
  }
  return { variants, errors, hash: variantsHash(variants) };
}

export function variantsHash(variants: readonly CvVariant[]): string {
  if (!variants.length) return "";
  return createHash("sha256")
    .update(JSON.stringify(variants.map((v) => [v.id, v.name, v.useFor, v.text])))
    .digest("hex")
    .slice(0, 16);
}

export type VariantSaveResult = { ok: true; id: string } | { ok: false; errors: string[] };

/**
 * Creates or updates a variant. Without `id` a new one is created with an id from its
 * name; with `id` the file keeps that id, so renaming changes only the name.
 */
export function saveVariant(
  profileDir: string,
  input: { id?: string; name: string; useFor: string; text: string },
): VariantSaveResult {
  const dir = join(/*turbopackIgnore: true*/ profileDir, CV_VARIANTS_DIR);
  const existing = loadVariants(profileDir).variants;
  let id = input.id;
  if (!id) {
    const base = variantIdFrom(input.name);
    id = base;
    for (
      let n = 2;
      existing.some((v) => v.id === id) ||
      existsSync(join(/*turbopackIgnore: true*/ dir, `${id}.md`));
      n++
    )
      id = `${base}-${n}`;
    if (existing.length >= MAX_VARIANTS)
      return { ok: false, errors: [`At most ${MAX_VARIANTS} CV variants`] };
  } else if (!existsSync(join(/*turbopackIgnore: true*/ dir, `${id}.md`))) {
    return { ok: false, errors: [`No CV variant "${id}"`] };
  }
  const raw = serializeVariant({ name: input.name, useFor: input.useFor, text: input.text });
  const parsed = parseVariant(id, raw);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(/*turbopackIgnore: true*/ dir, `${id}.md`), raw);
  return { ok: true, id };
}

/** Renames a variant; its id (file name) stays, so stored references keep working. */
export function renameVariant(profileDir: string, id: string, name: string): VariantSaveResult {
  const v = loadVariants(profileDir).variants.find((x) => x.id === id);
  if (!v) return { ok: false, errors: [`No CV variant "${id}"`] };
  return saveVariant(profileDir, { ...v, name });
}

export function deleteVariant(profileDir: string, id: string): boolean {
  if (!isVariantId(id)) return false;
  const file = join(/*turbopackIgnore: true*/ profileDir, CV_VARIANTS_DIR, `${id}.md`);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}
