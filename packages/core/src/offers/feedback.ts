// Structured dismiss reasons (offer-feedback spec). Dependency-free: the web bundles it.

export const DISMISS_REASONS = [
  { id: "salary", label: "Salary too low" },
  { id: "stack", label: "Stack or technologies" },
  { id: "seniority", label: "Seniority" },
  { id: "company", label: "Company or sector" },
  { id: "location", label: "Location or time zone" },
  { id: "contract", label: "Contract type" },
  { id: "language", label: "Language" },
  { id: "duplicate", label: "Duplicate or already seen" },
  { id: "other", label: "Other" },
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number]["id"];

export const DISMISS_REASON_IDS = DISMISS_REASONS.map((r) => r.id) as [
  DismissReason,
  ...DismissReason[],
];

export const DISMISS_NOTE_MAX = 300;

export function dismissReasonLabel(id: string): string {
  return DISMISS_REASONS.find((r) => r.id === id)?.label ?? id;
}

/** Keeps known ids once, in the list's order. */
export function cleanDismissReasons(ids: readonly string[]): DismissReason[] {
  return DISMISS_REASON_IDS.filter((id) => ids.includes(id));
}

/** "Contract type, Location or time zone — US W2 only" (stored as the offer's triage reason). */
export function summarizeDismissal(
  reasons: readonly string[],
  note?: string | null,
): string | null {
  const labels = cleanDismissReasons(reasons).map(dismissReasonLabel);
  const n = note?.trim().replace(/\s+/g, " ") ?? "";
  if (!labels.length) return n || null;
  return n ? `${labels.join(", ")} — ${n}` : labels.join(", ");
}

/** Learning is off by default only when the sole reason is "duplicate". */
export function learnableByDefault(reasons: readonly string[]): boolean {
  const r = cleanDismissReasons(reasons);
  return !(r.length === 1 && r[0] === "duplicate");
}

// ---------- learned preference text (shared with the Settings editor) ----------

export const PREFERENCE_TEXT_MAX = 200;

export const INSTRUCTION_LIKE =
  /\b(ignore|disregard|system prompt|assistant|as an ai|instruction|you must|override|score (it|this|them|every)|rate (it|this) \d+|set the score)\b/i;

/** Normalized for duplicate checks: lowercase letters and digits only. */
export function normalizePreference(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function cleanPreferenceText(raw: string): { text: string } | { error: string } {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < 8) return { error: "too short" };
  if (text.length > PREFERENCE_TEXT_MAX) return { error: "too long" };
  if (/https?:\/\/|www\.|[<>{}]/i.test(text)) return { error: "contains a URL or markup" };
  if (INSTRUCTION_LIKE.test(text)) return { error: "reads like an instruction" };
  return { text };
}
