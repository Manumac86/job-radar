import { describe, expect, it } from "vitest";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  offerStatus,
  pipelineLabel,
  type OfferStatus,
} from "../offer-status";

describe("offer status", () => {
  it("is Applied with an application, otherwise the triage state", () => {
    expect(offerStatus("shortlisted", "technical_interview")).toBe("applied");
    expect(offerStatus("new", null)).toBe("new");
    expect(offerStatus("dismissed", null)).toBe("dismissed");
    expect(STATUS_LABELS.applied).toBe("Applied");
    expect(STATUS_LABELS.archived).toBe("Archived");
  });

  it("gives every status its own color token", () => {
    const statuses: OfferStatus[] = [
      "applied",
      "new",
      "shortlisted",
      "dismissed",
      "filtered",
      "archived",
    ];
    const tokens = statuses.map((s) => /text-(status-[a-z]+)/.exec(STATUS_BADGE_CLASSES[s])?.[1]);
    expect(new Set(tokens).size).toBe(statuses.length);
    expect(tokens).toEqual(statuses.map((s) => `status-${s}`));
  });

  it("shows the pipeline stage label, custom stages included, and nothing without an application", () => {
    const labels = {
      technical_interview: "Technical interview",
      custom_1: "Entrevista con el CEO",
    };
    expect(pipelineLabel("technical_interview", labels)).toBe("Technical interview");
    expect(pipelineLabel("custom_1", labels)).toBe("Entrevista con el CEO");
    expect(pipelineLabel(null, labels)).toBe("");
  });
});
