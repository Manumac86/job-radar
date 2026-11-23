import { describe, expect, it } from "vitest";
import { emailKey, isLinkedInUrl, linkedInKey, noteSchema, personInputSchema } from "../src/index";

describe("person input (offer-notes-and-people D3)", () => {
  it("accepts LinkedIn profiles on linkedin.com and its subdomains", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/in/jane-roe")).toBe(true);
    expect(isLinkedInUrl("https://es.linkedin.com/in/jane-roe")).toBe(true);
    expect(isLinkedInUrl("https://linkedin.com/in/jane-roe")).toBe(true);
    expect(isLinkedInUrl("http://www.linkedin.com/in/jane-roe")).toBe(false);
    expect(isLinkedInUrl("https://linkedin.com.example/in/x")).toBe(false);
    expect(isLinkedInUrl("https://evil-linkedin.com/in/x")).toBe(false);
    expect(isLinkedInUrl("not a url")).toBe(false);
  });

  it("trims fields, turns empty ones into null and validates", () => {
    const r = personInputSchema.parse({
      name: "  Jane Roe ",
      role: "Recruiter",
      linkedinUrl: "",
      email: " jane@contoso.example ",
      other: "@janeroe on Telegram",
    });
    expect(r).toEqual({
      name: "Jane Roe",
      role: "Recruiter",
      linkedinUrl: null,
      email: "jane@contoso.example",
      company: null,
      phone: null,
      other: "@janeroe on Telegram",
      note: null,
    });
  });

  it("rejects a missing or long name, another host and a bad email", () => {
    const issues = (input: Record<string, unknown>) =>
      personInputSchema.safeParse(input).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(issues({ name: "" })).toEqual(["name"]);
    expect(issues({ name: "x".repeat(121) })).toEqual(["name"]);
    expect(issues({ name: "Jane", linkedinUrl: "https://example.com/jane" })).toEqual([
      "linkedinUrl",
    ]);
    expect(issues({ name: "Jane", email: "jane" })).toEqual(["email"]);
  });

  it("notes are required and limited", () => {
    expect(noteSchema.parse("  Contacted on Telegram ")).toBe("Contacted on Telegram");
    expect(noteSchema.safeParse("   ").success).toBe(false);
    expect(noteSchema.safeParse("x".repeat(2001)).success).toBe(false);
  });
});

describe("duplicate keys (people-directory D4)", () => {
  it("one LinkedIn profile has one key", () => {
    const key = "/in/jane-roe";
    expect(linkedInKey("https://www.linkedin.com/in/jane-roe")).toBe(key);
    expect(linkedInKey("https://es.linkedin.com/in/Jane-Roe/")).toBe(key);
    expect(linkedInKey("https://linkedin.com/in/jane-roe?trk=public_profile#x")).toBe(key);
    expect(linkedInKey("https://www.linkedin.com/in/jane-roe-2")).not.toBe(key);
    expect(linkedInKey("https://example.com/in/jane-roe")).toBeNull();
    expect(linkedInKey("https://www.linkedin.com/")).toBeNull();
    expect(linkedInKey(null)).toBeNull();
  });

  it("emails compare without case or spaces", () => {
    expect(emailKey(" Jane@Contoso.example ")).toBe("jane@contoso.example");
    expect(emailKey("")).toBeNull();
  });

  it("the company is optional and trimmed", () => {
    expect(personInputSchema.parse({ name: "Jane", company: " Northwind Talent " }).company).toBe(
      "Northwind Talent",
    );
    expect(personInputSchema.parse({ name: "Jane", company: "" }).company).toBeNull();
  });
});
