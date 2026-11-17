// Read-only browsing guard (design D4, browser-sessions spec). Adapters receive a ReadOnlyPage,
// never a Playwright Page. This file is the only place in packages/sources allowed to call
// interaction methods, and only for pagination / "show more".
import type { Locator, Page } from "playwright";

/** Labels that must never be clicked, in any language we expect on these sites. */
export const FORBIDDEN_LABELS =
  /\b(apply|applying|submit|send|connect|follow|message|contact|bid|propose|proposal|hire|invite|accept|save job|easy apply|postular|enviar|solicitar|aplicar|conectar|seguir|mensaje|contactar|postuler|envoyer|candidater|bewerben|senden)\b/i;

/** The only things safeClick may click. */
export const ALLOWED_LABELS =
  /^(next|next page|›|»|>|show more|see more|load more|more jobs|more results|siguiente|ver más|cargar más|suivant|voir plus|\d{1,3})$/i;

export class ForbiddenActionError extends Error {
  override readonly name = "ForbiddenActionError";
  constructor(readonly label: string) {
    super(
      `Blocked a click on "${label}": Job Radar is read-only and never applies, sends or connects`,
    );
  }
}

export class PageCapReachedError extends Error {
  override readonly name = "PageCapReachedError";
  constructor(
    readonly site: string,
    readonly cap: number,
  ) {
    super(`Page cap reached for ${site} (${cap} pages per hour); resuming in the next window`);
  }
}

/** Page views per site per rolling hour. */
export class PageBudget {
  private readonly views = new Map<string, number[]>();
  constructor(
    private readonly capPerHour: number = 20,
    private readonly now: () => number = Date.now,
  ) {}

  used(site: string): number {
    const cutoff = this.now() - 3_600_000;
    const recent = (this.views.get(site) ?? []).filter((t) => t > cutoff);
    this.views.set(site, recent);
    return recent.length;
  }

  take(site: string): void {
    if (this.used(site) >= this.capPerHour) throw new PageCapReachedError(site, this.capPerHour);
    this.views.set(site, [...(this.views.get(site) ?? []), this.now()]);
  }

  get cap(): number {
    return this.capPerHour;
  }
}

export interface ReadOnlyOptions {
  site: string;
  budget: PageBudget;
  /** Random pause before each navigation, min 5 s (browser-sessions spec). */
  delayMs?: { min: number; max: number };
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface ReadOnlyPage {
  goto(url: string): Promise<void>;
  url(): string;
  html(): Promise<string>;
  waitFor(selector: string, timeoutMs?: number): Promise<boolean>;
  scroll(): Promise<void>;
  /** Pagination / "show more" only. Throws ForbiddenActionError for anything else. */
  safeClick(selector: string): Promise<void>;
  readonly pagesViewed: number;
}

async function labelOf(locator: Locator): Promise<string> {
  const parts = await Promise.all([
    locator.innerText({ timeout: 2000 }).catch(() => ""),
    locator.getAttribute("aria-label", { timeout: 2000 }).catch(() => null),
    locator.getAttribute("value", { timeout: 2000 }).catch(() => null),
    locator.getAttribute("title", { timeout: 2000 }).catch(() => null),
  ]);
  return parts
    .filter((p): p is string => Boolean(p))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Throws unless the label is an allowed pagination label and contains no forbidden word. */
export function assertSafeLabel(label: string): void {
  if (!label || FORBIDDEN_LABELS.test(label) || !ALLOWED_LABELS.test(label)) {
    throw new ForbiddenActionError(label || "(unlabeled element)");
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function readOnlyPage(page: Page, o: ReadOnlyOptions): ReadOnlyPage {
  const delay = o.delayMs ?? { min: 5000, max: 20000 };
  const sleep = o.sleep ?? defaultSleep;
  let viewed = 0;
  // Never less than 5 s between pages, whatever the options say.
  const min = Math.max(5000, delay.min);
  const max = Math.max(min, delay.max);
  const pause = () => sleep(min + Math.random() * (max - min));
  return {
    async goto(url) {
      o.budget.take(o.site);
      if (viewed > 0) await pause();
      viewed++;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      o.log?.(`viewed ${new URL(url).pathname}`);
    },
    url: () => page.url(),
    html: () => page.content(),
    async waitFor(selector, timeoutMs = 10_000) {
      return page
        .waitForSelector(selector, { timeout: timeoutMs, state: "attached" })
        .then(() => true)
        .catch(() => false);
    },
    async scroll() {
      await page.mouse.wheel(0, 1200);
    },
    async safeClick(selector) {
      const target = page.locator(selector).first();
      const label = await labelOf(target);
      assertSafeLabel(label);
      o.budget.take(o.site);
      await pause();
      viewed++;
      // The single allowed interaction call in packages/sources (see eslint.config.js).
      await target.click({ timeout: 10_000 });
    },
    get pagesViewed() {
      return viewed;
    },
  };
}
