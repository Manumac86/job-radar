import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isExampleCv } from "../src/profile";

const seed = join(import.meta.dirname, "..", "..", "..", "profile-seed");

describe("example profile", () => {
  it("recognizes the bundled seed CV", () => {
    expect(isExampleCv(readFileSync(join(seed, "cv.md"), "utf8"))).toBe(true);
  });

  it("does not flag the owner's own CV", () => {
    expect(isExampleCv("# Jane Doe\nStaff engineer\n")).toBe(false);
  });
});
