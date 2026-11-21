// Candidate-portal statuses (mygreenhouse-source D4/D5): match each portal application to the
// pipeline, then move it automatically (with Undo) or suggest, through the email policy.
import {
  decidePortal,
  isInterviewStage,
  matchPortalApplication,
  portalCategory,
  type PolicyDecision,
} from "@job-radar/core";
import {
  addTimelineEvent,
  createApplication,
  findOfferByExternalId,
  findPortalApplication,
  getApplication,
  getApplicationForOffer,
  getOffer,
  getPortalApplication,
  insertPortalApplication,
  listStages,
  offerLinksFor,
  openApplications,
  updatePortalApplication,
  type Db,
  type NotificationKind,
  type PortalApplication,
  type PortalCategory,
} from "@job-radar/db";
import type { MyGreenhouseApplication } from "@job-radar/sources";
import type { Notifier } from "../notifier";
import { applyPipelineUpdate, undoPipelineUpdate } from "../pipeline-updates";

export class PortalError extends Error {
  override readonly name = "PortalError";
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface PortalActionResult {
  ok: boolean;
  status: PortalApplication["status"];
  message: string;
}

export interface PortalSyncSummary {
  read: number;
  unchanged: number;
  created: number;
  moved: number;
  suggested: number;
}

export interface PortalServiceOptions {
  db: Db;
  notifier?: Notifier;
  onInterviewStage?: (applicationId: number) => void;
  now?: () => Date;
}

/** The portal's display name, for timeline entries and alerts. */
const PORTAL_LABEL: Record<string, string> = { mygreenhouse: "MyGreenhouse" };

export class PortalService {
  constructor(private readonly o: PortalServiceOptions) {}

  private now(): Date {
    return this.o.now?.() ?? new Date();
  }

  private label(source: string): string {
    return PORTAL_LABEL[source] ?? source;
  }

  private customStage(stage: string): boolean {
    return Boolean(listStages(this.o.db).find((s) => s.key === stage)?.custom);
  }

  /** Records what a portal run read. A row changes only when its status changes (D4). */
  sync(
    source: string,
    items: MyGreenhouseApplication[],
    log: (line: string) => void = () => {},
  ): PortalSyncSummary {
    const db = this.o.db;
    const summary: PortalSyncSummary = {
      read: items.length,
      unchanged: 0,
      created: 0,
      moved: 0,
      suggested: 0,
    };
    for (const item of items) {
      const existing = findPortalApplication(db, source, item.portalId);
      if (existing && existing.lastStatus === item.status) {
        summary.unchanged++;
        continue;
      }
      const at = this.now();
      const matched = this.match(item, existing);
      const candidates = matched.candidates;
      let applicationId = matched.applicationId;
      if (!applicationId && !candidates.length && item.jobKey) {
        // Not in the pipeline yet: the run imported its job, so it becomes an application.
        const offer = findOfferByExternalId(db, item.jobKey);
        if (offer && !getApplicationForOffer(db, offer.id)) {
          applicationId = createApplication(db, {
            offerId: offer.id,
            at: item.appliedAt ?? at,
            note: `Applied through Greenhouse (found on ${this.label(source)})`,
          }).id;
          summary.created++;
        }
      }
      const app = applicationId ? getApplication(db, applicationId) : undefined;
      const decision = decidePortal(
        item.status,
        app ? { stage: app.stage, customStage: this.customStage(app.stage) } : null,
        app?.id ?? null,
      );
      const fields = {
        jobKey: item.jobKey,
        company: item.company,
        title: item.title,
        url: item.url || null,
        applicationId: app?.id ?? null,
        lastStatus: item.status,
        statusSeenAt: at,
        category: portalCategory(item.status) as PortalCategory,
        candidates,
        status:
          decision.action === "auto"
            ? ("auto_applied" as const)
            : decision.action === "suggest"
              ? ("suggested" as const)
              : ("timeline_only" as const),
        pending: { targetStage: decision.targetStage, reasons: decision.reasons },
        undo: null,
      };
      const row = existing
        ? updatePortalApplication(db, existing.id, fields, at)
        : insertPortalApplication(db, { source, portalId: item.portalId, ...fields });
      if (decision.action === "auto" && app) {
        this.applyRow(row, app.id, decision.targetStage, "auto_applied");
        summary.moved++;
      } else {
        if (app) this.timeline(row, app.id, decision.action === "suggest" ? " (suggestion)" : "");
        if (decision.action === "suggest") {
          summary.suggested++;
          this.notify(row, decision, null, true);
        }
      }
    }
    log(
      `statuses: ${summary.read} read, ${summary.unchanged} unchanged, ${summary.created} added to the pipeline, ${summary.moved} moved, ${summary.suggested} to review`,
    );
    return summary;
  }

  /** D4 matching: the row's application, the same job, then company and title. */
  private match(
    item: MyGreenhouseApplication,
    existing: PortalApplication | undefined,
  ): { applicationId: number | null; candidates: number[] } {
    const db = this.o.db;
    if (existing?.applicationId && getApplication(db, existing.applicationId))
      return { applicationId: existing.applicationId, candidates: [] };
    if (item.jobKey) {
      const offer = findOfferByExternalId(db, item.jobKey);
      const app = offer ? getApplicationForOffer(db, offer.id) : undefined;
      if (app) return { applicationId: app.id, candidates: [] };
    }
    const m = matchPortalApplication(
      { jobKey: item.jobKey, company: item.company, title: item.title },
      openApplications(db).map((a) => ({
        applicationId: a.applicationId,
        companyName: a.companyName,
        title: a.title,
        jobKeys: offerLinksFor(db, a.offerId).map((l) => l.externalId),
      })),
    );
    return { applicationId: m.applicationId, candidates: m.candidates };
  }

  private timeline(row: PortalApplication, applicationId: number, suffix: string): void {
    const app = getApplication(this.o.db, applicationId);
    if (!app) return;
    addTimelineEvent(this.o.db, {
      offerId: app.offerId,
      applicationId,
      kind: "portal_status",
      message: `${this.label(row.source)}: ${row.lastStatus}${suffix}`,
      data: { portalApplicationId: row.id, status: row.status },
      at: row.statusSeenAt,
    });
  }

  private applyRow(
    row: PortalApplication,
    applicationId: number,
    targetStage: string | null,
    status: "auto_applied" | "applied",
  ): void {
    const db = this.o.db;
    const at = this.now();
    updatePortalApplication(db, row.id, { applicationId, status }, at);
    this.timeline({ ...row, status }, applicationId, "");
    const undo = applyPipelineUpdate(
      db,
      { applicationId, targetStage, note: `From ${this.label(row.source)}`, at },
      { source: "greenhouse", portalApplicationId: row.id },
    );
    const updated = updatePortalApplication(db, row.id, { undo }, at);
    if (undo.targetStage && isInterviewStage(undo.targetStage))
      this.o.onInterviewStage?.(applicationId);
    this.notify(updated, null, undo.targetStage, false);
  }

  private notify(
    row: PortalApplication,
    decision: PolicyDecision | null,
    movedTo: string | null,
    suggestion: boolean,
  ): void {
    if (!this.o.notifier) return;
    const kind: NotificationKind | null =
      row.category === "rejection" || row.category === "closed"
        ? "portal_rejection"
        : row.category === "offer"
          ? "portal_offer"
          : row.category === "interview"
            ? "portal_next_step"
            : null;
    if (!kind) return;
    const app = row.applicationId ? getApplication(this.o.db, row.applicationId) : undefined;
    const offer = app ? getOffer(this.o.db, app.offerId) : undefined;
    const who = offer ? `${offer.companyName} (${offer.title})` : `${row.company} (${row.title})`;
    const stageLabel = (key: string) =>
      listStages(this.o.db).find((s) => s.key === key)?.label ?? key;
    const lines = [`${this.label(row.source)} shows: ${row.lastStatus}`];
    if (movedTo) lines.push(`Moved to ${stageLabel(movedTo)}.`);
    else if (suggestion) {
      const reasons = decision?.reasons ?? row.pending?.reasons ?? [];
      const target = decision?.targetStage ?? row.pending?.targetStage ?? null;
      lines.push(
        `${target ? `Suggested: move to ${stageLabel(target)}` : "Suggested, not applied"}${reasons.length ? ` (${reasons.join("; ")})` : ""}.`,
      );
    }
    this.o.notifier.notify({
      kind,
      title: `${suggestion ? "Suggested: " : ""}${this.label(row.source)} update for ${who}`,
      body: lines.join("\n"),
      offerId: offer?.id ?? null,
      applicationId: app?.id ?? null,
      dedupeKey: `portal:${row.id}:${row.lastStatus}`,
    });
  }

  // ---------- owner actions ----------

  undo(id: number): PortalActionResult {
    const db = this.o.db;
    const row = getPortalApplication(db, id);
    if (!row) throw new PortalError("Update not found", 404);
    if (row.status === "undone")
      return { ok: false, status: row.status, message: "Already undone" };
    if (
      (row.status !== "auto_applied" && row.status !== "applied") ||
      !row.undo ||
      !row.applicationId
    )
      return { ok: false, status: row.status, message: "Nothing to undo" };
    const app = getApplication(db, row.applicationId);
    if (!app) throw new PortalError("Application not found", 404);
    const at = this.now();
    const label = this.label(row.source);
    const left = undoPipelineUpdate(
      db,
      app.id,
      row.undo,
      { source: "greenhouse", portalApplicationId: row.id },
      { note: `Undo ${label} update`, changedAfter: `the ${label} update`, at },
    );
    updatePortalApplication(db, id, { status: "undone" }, at);
    addTimelineEvent(db, {
      offerId: app.offerId,
      applicationId: app.id,
      kind: "portal_undone",
      message: `Undid the ${label} update "${row.lastStatus}"${left.length ? `; kept ${left.join(" and ")}` : ""}`,
      data: { portalApplicationId: id },
      at,
    });
    return {
      ok: true,
      status: "undone",
      message: left.length ? `Undone, except ${left.join(" and ")}` : "Undone",
    };
  }

  apply(id: number, applicationId?: number): PortalActionResult {
    const db = this.o.db;
    const row = getPortalApplication(db, id);
    if (!row) throw new PortalError("Update not found", 404);
    if (row.status !== "suggested")
      return {
        ok: false,
        status: row.status,
        message: row.status === "applied" ? "Already applied" : "This update is not a suggestion",
      };
    if (
      applicationId !== undefined &&
      row.applicationId !== applicationId &&
      !row.candidates.includes(applicationId)
    )
      throw new PortalError("That application was not a candidate for this update");
    const chosen =
      applicationId ??
      row.applicationId ??
      (row.candidates.length === 1 ? row.candidates[0] : undefined);
    if (!chosen) throw new PortalError("Pick the application this update is about");
    const app = getApplication(db, chosen);
    if (!app) throw new PortalError("Application not found", 404);
    // Re-decide for the chosen application; never to a stage email updates may not reach.
    const decision = decidePortal(row.lastStatus, { stage: app.stage, customStage: false }, app.id);
    const target = decision.targetStage ?? row.pending?.targetStage ?? null;
    this.applyRow(row, app.id, target === app.stage ? null : target, "applied");
    return { ok: true, status: "applied", message: "Applied" };
  }

  dismiss(id: number): PortalActionResult {
    const row = getPortalApplication(this.o.db, id);
    if (!row) throw new PortalError("Update not found", 404);
    if (row.status === "dismissed")
      return { ok: false, status: row.status, message: "Already dismissed" };
    if (row.status !== "suggested")
      return { ok: false, status: row.status, message: "This update is not a suggestion" };
    updatePortalApplication(this.o.db, id, { status: "dismissed" }, this.now());
    return { ok: true, status: "dismissed", message: "Dismissed" };
  }
}
