import { describe, expect, it } from "vitest";
import { appTimeZone, budgetDay } from "../src";

describe("appTimeZone", () => {
  it("uses JOB_RADAR_TIMEZONE when it is a valid zone", () => {
    expect(appTimeZone({ JOB_RADAR_TIMEZONE: " America/New_York " })).toBe("America/New_York");
  });

  it("falls back to the runtime zone when unset or invalid", () => {
    const runtime = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(appTimeZone({})).toBe(runtime);
    expect(appTimeZone({ JOB_RADAR_TIMEZONE: "Mars/Olympus" })).toBe(runtime);
  });

  it("counts the budget day in the given zone", () => {
    const lateEvening = new Date("2026-11-16T03:30:00Z"); // 22:30 on the 15th in New York
    expect(budgetDay(lateEvening, "America/New_York")).toBe("2026-11-15");
    expect(budgetDay(lateEvening, "Europe/Madrid")).toBe("2026-11-16");
  });
});
