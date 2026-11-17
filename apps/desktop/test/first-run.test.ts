import { describe, expect, it } from "vitest";
import { choiceFor } from "../src/first-run";

describe("first-run dialog", () => {
  it("maps the buttons to import, start fresh and quit", () => {
    expect(choiceFor(0)).toBe("import");
    expect(choiceFor(1)).toBe("fresh");
    expect(choiceFor(2)).toBe("quit");
    expect(choiceFor(-1)).toBe("quit");
  });
});
