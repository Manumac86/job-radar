import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePreferences, regionMatch, remoteOnlyReason } from "../src/index";

const seedPrefs = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "profile-seed", "preferences.yaml"),
  "utf8",
);

describe("location regions in preferences", () => {
  it("old profiles load with empty lists and a bonus of 5", () => {
    const r = parsePreferences(seedPrefs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.value.location).toMatchObject({
      hybrid_regions: [],
      preferred_regions: [],
      preferred_bonus: 5,
    });
  });

  it("rejects a bonus above 20", () => {
    const text = seedPrefs.replace(
      "  remote_only: true\n",
      "  remote_only: true\n  preferred_regions: [Spain]\n  preferred_bonus: 25\n",
    );
    const r = parsePreferences(text);
    expect(r.ok).toBe(false);
  });
});

describe("regionMatch", () => {
  const names = ["Spain", "España", "Madrid"];
  it("matches whole words in location and regions, ignoring case and accents", () => {
    expect(regionMatch({ location: "Madrid, Spain" }, names)).toBe("Spain");
    expect(regionMatch({ location: "Remote", regions: ["EMEA", "spain"] }, names)).toBe("Spain");
    expect(regionMatch({ location: "Valencia, Espana" }, ["España"])).toBe("España");
    expect(regionMatch({ location: "Sevilla, España" }, ["Espana"])).toBe("Espana");
  });

  it("does not match parts of words, other places or empty input", () => {
    expect(regionMatch({ location: "Spainish Town, Jamaica" }, names)).toBeNull();
    expect(regionMatch({ location: "Berlin, Germany", regions: ["Europe"] }, names)).toBeNull();
    expect(regionMatch({ location: null, regions: [] }, names)).toBeNull();
    expect(regionMatch({ location: "Madrid" }, [])).toBeNull();
  });
});

describe("remote-only rule with hybrid regions", () => {
  const location = { remote_only: true, hybrid_regions: ["Spain", "Madrid"] };
  it("lets hybrid offers in a hybrid region through", () => {
    expect(
      remoteOnlyReason({ remotePolicy: "hybrid", location: "Madrid, Spain" }, location),
    ).toBeNull();
  });

  it("filters hybrid offers elsewhere and every on-site offer", () => {
    expect(
      remoteOnlyReason({ remotePolicy: "hybrid", location: "Berlin, Germany" }, location),
    ).toBe("Not remote (hybrid)");
    expect(remoteOnlyReason({ remotePolicy: "onsite", location: "Madrid" }, location)).toBe(
      "Not remote (onsite)",
    );
    expect(remoteOnlyReason({ remotePolicy: "remote", location: "US" }, location)).toBeNull();
    expect(remoteOnlyReason({ remotePolicy: "unknown" }, location)).toBeNull();
  });

  it("does nothing when the profile is not remote-only", () => {
    expect(
      remoteOnlyReason({ remotePolicy: "onsite", location: "Berlin" }, { remote_only: false }),
    ).toBeNull();
  });
});
