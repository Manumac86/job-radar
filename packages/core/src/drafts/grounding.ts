// Deterministic grounding pass (application-drafts spec, "No fabrication"): any figure in the
// draft that does not appear in the CV or profile becomes a placeholder to verify.

/** Figures that look like claims: percentages, multipliers, money, counts with units. */
const CLAIM_RE =
  /(?<![\w.])(?:[$€£]\s?)?\d+(?:[.,]\d+)?\s?(?:%|x\b|k\b|m\b|\+)?(?:\s?(?:percent|engineers|developers|people|users|customers|clients|teams|projects|million|billion|hours|weeks|months|years))?(?![\w])/gi;

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(m[0].replace(",", "."));
  return out;
}

export interface GroundingResult {
  text: string;
  replaced: string[];
}

/**
 * Replaces ungrounded figures with "[VERIFY: <figure>]". Numbers from the offer itself
 * (e.g. its salary or team size) and from the trusted sources are allowed.
 */
export function groundFigures(text: string, trusted: string[], offerText = ""): GroundingResult {
  const allowed = numbersIn([...trusted, offerText].join("\n"));
  const replaced: string[] = [];
  const out = text.replace(CLAIM_RE, (match) => {
    if (/\[VERIFY/i.test(match)) return match;
    const core = /\d+(?:[.,]\d+)?/.exec(match)?.[0]?.replace(",", ".");
    if (!core) return match;
    // Years like 2019, small ordinals in prose ("2 weeks notice" is still checked), and ranges from the offer pass.
    if (allowed.has(core)) return match;
    replaced.push(match.trim());
    return `[VERIFY: ${match.trim()}]`;
  });
  return { text: out, replaced };
}

export function groundDraft<
  T extends {
    message: string;
    screening_answers: { question: string; answer: string }[];
    verify_before_sending: string[];
  },
>(draft: T, trusted: string[], offerText: string): T {
  const msg = groundFigures(draft.message, trusted, offerText);
  const answers = draft.screening_answers.map((a) => {
    const g = groundFigures(a.answer, trusted, offerText);
    msg.replaced.push(...g.replaced);
    return { ...a, answer: g.text };
  });
  const verify = new Set(draft.verify_before_sending);
  for (const r of msg.replaced)
    verify.add(`Unverified figure "${r}" — not found in your CV or profile`);
  // Placeholders the model left itself must be listed too.
  for (const m of [draft.message, ...answers.map((a) => a.answer)]
    .join("\n")
    .matchAll(/\[([^\]]{2,120})\]/g)) {
    if (!/^VERIFY: /i.test(m[1] ?? "")) verify.add(`Placeholder to fill: [${m[1]}]`);
  }
  return {
    ...draft,
    message: msg.text,
    screening_answers: answers,
    verify_before_sending: [...verify],
  };
}
