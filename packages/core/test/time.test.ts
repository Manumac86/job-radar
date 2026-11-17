import { describe, expect, it } from "vitest";
import { isWithinWindow, nextMidnight, nextWallClock, zonedTimeToUtc } from "../src/index";

const TZ = "Europe/Madrid";

describe("time helpers", () => {
  it("converts Madrid wall-clock time to UTC across DST", () => {
    expect(zonedTimeToUtc(2026, 11, 15, 8, 30, TZ).toISOString()).toBe("2026-11-15T07:30:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 1, 8, 30, TZ).toISOString()).toBe("2026-07-01T06:30:00.000Z");
  });

  it("finds the next Madrid midnight", () => {
    expect(nextMidnight(new Date("2026-11-15T22:30:00Z"), TZ).toISOString()).toBe(
      "2026-11-15T23:00:00.000Z",
    );
    expect(nextMidnight(new Date("2026-11-15T23:30:00Z"), TZ).toISOString()).toBe(
      "2026-11-16T23:00:00.000Z",
    );
  });

  it("handles quiet hours that cross midnight", () => {
    const at = (iso: string) => isWithinWindow(new Date(iso), "22:00", "08:00", TZ);
    expect(at("2026-11-15T21:30:00Z")).toBe(true); // 22:30 Madrid
    expect(at("2026-11-15T06:59:00Z")).toBe(true); // 07:59
    expect(at("2026-11-15T07:00:00Z")).toBe(false); // 08:00
    expect(at("2026-11-15T12:00:00Z")).toBe(false);
  });

  it("finds the next digest time", () => {
    expect(nextWallClock(new Date("2026-11-15T06:00:00Z"), "08:30", TZ).toISOString()).toBe(
      "2026-11-15T07:30:00.000Z",
    );
    expect(nextWallClock(new Date("2026-11-15T08:00:00Z"), "08:30", TZ).toISOString()).toBe(
      "2026-11-16T07:30:00.000Z",
    );
  });
});
