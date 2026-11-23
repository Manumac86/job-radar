// People on an offer (contacts spec; offer-notes-and-people D3). Free of server code, so the
// form can validate with the same rules as the server.
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((v) => (v ? v : null))
    .nullish()
    .transform((v) => v ?? null);

/** An https link on linkedin.com or one of its subdomains (es.linkedin.com, www.linkedin.com). */
export function isLinkedInUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  return u.protocol === "https:" && (host === "linkedin.com" || host.endsWith(".linkedin.com"));
}

/**
 * The identity of a LinkedIn profile for duplicate checks (people-directory D4): the lower-cased
 * path without a trailing slash, ignoring subdomain, query and fragment. Null for other URLs.
 */
export function linkedInKey(value: string | null | undefined): string | null {
  if (!value || !isLinkedInUrl(value.trim())) return null;
  const path = new URL(value.trim()).pathname.toLowerCase().replace(/\/+$/, "");
  return path || null;
}

/** The identity of an email address for duplicate checks. */
export function emailKey(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  return v ? v : null;
}

export const personInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "At most 120 characters"),
  role: optionalText(200),
  /** Where the person works (people-directory D1); empty means no company. */
  company: optionalText(120),
  linkedinUrl: optionalText(500).refine((v) => v === null || isLinkedInUrl(v), {
    message: "Use an https link on linkedin.com",
  }),
  email: optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, {
    message: "Not a valid email address",
  }),
  phone: optionalText(200),
  other: optionalText(200),
  note: optionalText(1000),
});

export type PersonInput = z.input<typeof personInputSchema>;
export type PersonFields = z.output<typeof personInputSchema>;

export const NOTE_MAX_LENGTH = 2000;

export const noteSchema = z
  .string()
  .trim()
  .min(1, "Write a note first")
  .max(NOTE_MAX_LENGTH, `At most ${NOTE_MAX_LENGTH} characters`);
