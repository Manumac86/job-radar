import { describe, expect, it } from "vitest";
import {
  decidePortal,
  matchPortalApplication,
  portalCategory,
  titleOverlap,
  type PortalMatchCandidate,
} from "../src/mail/portal";

const at = (stage: string, customStage = false) => ({ stage, customStage });

describe("portal statuses", () => {
  it("maps each captured status and stage names to a category", () => {
    expect(portalCategory("applied")).toBe("acknowledgement");
    expect(portalCategory("inactive")).toBe("closed");
    expect(portalCategory("Technical Interview")).toBe("interview");
    expect(portalCategory("Recruiter Screen")).toBe("interview");
    expect(portalCategory("Application Review")).toBe("in_review");
    expect(portalCategory("Offer")).toBe("offer");
    expect(portalCategory("Rejected")).toBe("rejection");
    expect(portalCategory("Reference Check")).toBe("unknown");
  });

  it("decides like the email policy, never closing on 'inactive'", () => {
    expect(decidePortal("applied", at("applied"), 1)).toEqual({
      action: "timeline_only",
      targetStage: null,
      reasons: [],
    });
    expect(decidePortal("Rejected", at("screening_call"), 1)).toMatchObject({
      action: "auto",
      targetStage: "rejected",
    });
    const closed = decidePortal("inactive", at("applied"), 1);
    expect(closed.action).toBe("suggest");
    expect(closed.targetStage).toBe("rejected");
    expect(closed.reasons[0]).toMatch(/inactive/);
    expect(decidePortal("Technical Interview", at("applied"), 1)).toMatchObject({
      action: "auto",
      targetStage: "technical_interview",
    });
    expect(decidePortal("Offer", at("final_interview"), 1)).toMatchObject({
      action: "auto",
      targetStage: "offer_received",
    });
    // Already there (an email moved it first): timeline only, no second move.
    expect(decidePortal("Technical Interview", at("technical_interview"), 1).action).toBe(
      "timeline_only",
    );
    // Backwards: a suggestion.
    expect(decidePortal("Recruiter Screen", at("final_interview"), 1).action).toBe("suggest");
    expect(decidePortal("Reference Check", at("applied"), 1)).toMatchObject({
      action: "suggest",
      targetStage: null,
    });
    expect(decidePortal("Rejected", null, null).action).toBe("suggest");
    // Closed by hand or by an email already: no suggestion.
    expect(decidePortal("inactive", at("rejected"), 1).action).toBe("timeline_only");
  });
});

describe("portal application matching", () => {
  const open: PortalMatchCandidate[] = [
    {
      applicationId: 1,
      companyName: "Northwind Traders",
      title: "Senior Software Engineer – Integrations",
      jobKeys: ["northwind:1"],
    },
    {
      applicationId: 2,
      companyName: "Northwind Traders, Inc.",
      title: "Software Engineer, Integrations",
      jobKeys: [],
    },
    { applicationId: 3, companyName: "Litware", title: "Staff Engineer", jobKeys: [] },
  ];

  it("matches by job link first", () => {
    expect(
      matchPortalApplication(
        { jobKey: "northwind:1", company: "Northwind", title: "anything" },
        open,
      ),
    ).toEqual({ applicationId: 1, candidates: [], via: "job" });
  });

  it("two applications at one company: the exact title wins, else a suggestion", () => {
    expect(
      matchPortalApplication(
        {
          jobKey: "northwind:2",
          company: "Northwind Traders, Inc.",
          title: "Software Engineer, Integrations",
        },
        open,
      ),
    ).toEqual({ applicationId: 2, candidates: [], via: "title" });
    expect(
      matchPortalApplication(
        {
          jobKey: null,
          company: "Northwind Traders",
          title: "Software Engineer Integrations Team",
        },
        open,
      ),
    ).toEqual({ applicationId: null, candidates: [1, 2], via: null });
  });

  it("never matches an application for a different Greenhouse job by title", () => {
    expect(
      matchPortalApplication(
        {
          jobKey: "northwind:9",
          company: "Northwind Traders",
          title: "Senior Software Engineer Integrations",
        },
        open.map((c) => (c.applicationId === 2 ? { ...c, jobKeys: ["northwind:2"] } : c)),
      ),
    ).toEqual({ applicationId: null, candidates: [], via: null });
  });

  it("no match", () => {
    expect(
      matchPortalApplication({ jobKey: "x:1", company: "Contoso", title: "Staff Engineer" }, open),
    ).toEqual({ applicationId: null, candidates: [], via: null });
    expect(titleOverlap("Staff Engineer", "Engineering Manager")).toBe(0);
  });
});
