import { describe, expect, it } from "vitest";
import { createPageReader, formatReadPage, isPrivateAddress, pageToText } from "../src/read-page";

type Route = { status?: number; type?: string; body?: string; location?: string };

/** A fake web: host+path → response. Records every request (method, credentials). */
function fakeWeb(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = routes[url];
    if (!r)
      return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    const headers: Record<string, string> = {
      "content-type": r.type ?? "text/html; charset=utf-8",
    };
    if (r.location) headers["location"] = r.location;
    return new Response(r.body ?? "", { status: r.status ?? 200, headers });
  }) as typeof fetch;
  const resolve = async (host: string) =>
    host === "evil-rebind.example" ? ["192.168.1.10"] : ["93.184.216.34"];
  return { fetchImpl, resolve, calls };
}

const ABOUT = `<html><head><title>About Acme</title><script>steal()</script></head>
<body><nav>Menu</nav><h1>About Acme</h1><p>We build <b>AI agents</b> for logistics.</p>
<p>Read our <a href="/blog/series-a">Series A announcement</a>.</p><form><input name="x"></form></body></html>`;

describe("pageToText", () => {
  it("keeps headings, paragraphs and absolute links and drops scripts and forms", () => {
    const { title, text } = pageToText(ABOUT, new URL("https://acme.example/about"));
    expect(title).toBe("About Acme");
    expect(text).toContain("We build AI agents for logistics.");
    expect(text).toContain("[Series A announcement](https://acme.example/blog/series-a)");
    expect(text).not.toContain("steal");
  });
});

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local, CGNAT and mapped addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "0.0.0.0",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});

describe("createPageReader", () => {
  it("reads a public page with GET and no credentials, and records it as read", async () => {
    const web = fakeWeb({ "https://acme.example/about": { body: ABOUT } });
    const reader = createPageReader(web);
    const page = await reader.read("https://acme.example/about#team");
    expect(page.title).toBe("About Acme");
    expect(web.calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "manual",
    });
    expect([...reader.readUrls]).toEqual(["https://acme.example/about"]);
    expect(formatReadPage(page)).toContain('<untrusted name="page">');
  });

  it("refuses private, local and non-http addresses, also after DNS and redirects", async () => {
    const web = fakeWeb({
      "https://acme.example/go": { status: 302, location: "http://192.168.1.10/admin" },
      "https://acme.example/sneaky": { status: 301, location: "https://evil-rebind.example/" },
    });
    const reader = createPageReader(web);
    for (const bad of [
      "http://192.168.1.10/admin",
      "http://localhost:4000/offers",
      "file:///etc/passwd",
      "https://evil-rebind.example/",
      "https://user:pw@acme.example/",
      "https://acme.example/go",
      "https://acme.example/sneaky",
    ])
      await expect(reader.read(bad), bad).rejects.toThrow(/private|local|Only http|credentials/i);
    expect(web.calls.map((c) => c.url)).toEqual([
      "https://acme.example/go",
      "https://acme.example/sneaky",
    ]);
    expect(reader.readUrls.size).toBe(0);
  });

  it("follows at most three public redirects and records both ends", async () => {
    const web = fakeWeb({
      "https://a.example/1": { status: 301, location: "https://a.example/2" },
      "https://a.example/2": { status: 301, location: "/3" },
      "https://a.example/3": { status: 301, location: "https://b.example/final" },
      "https://b.example/final": { body: "<p>Final</p>" },
      "https://loop.example/0": { status: 302, location: "https://loop.example/1" },
      "https://loop.example/1": { status: 302, location: "https://loop.example/2" },
      "https://loop.example/2": { status: 302, location: "https://loop.example/3" },
      "https://loop.example/3": { status: 302, location: "https://loop.example/4" },
    });
    const reader = createPageReader(web);
    expect((await reader.read("https://a.example/1")).url).toBe("https://b.example/final");
    expect([...reader.readUrls]).toEqual(["https://a.example/1", "https://b.example/final"]);
    await expect(reader.read("https://loop.example/0")).rejects.toThrow(/redirects/);
  });

  it("caps type, size, text length and pages per research", async () => {
    const web = fakeWeb({
      "https://a.example/pdf": { type: "application/pdf", body: "%PDF" },
      "https://a.example/big": { body: "x".repeat(2_000) },
      "https://a.example/long": { type: "text/plain", body: "word ".repeat(100) },
      "https://a.example/err": { status: 500 },
    });
    const reader = createPageReader({ ...web, maxBytes: 1_000, maxChars: 50, maxPages: 4 });
    await expect(reader.read("https://a.example/pdf")).rejects.toThrow(/content type/);
    await expect(reader.read("https://a.example/big")).rejects.toThrow(/larger/);
    const long = await reader.read("https://a.example/long");
    expect(long).toMatchObject({ truncated: true });
    expect(long.text.length).toBe(50);
    await expect(reader.read("https://a.example/err")).rejects.toThrow(/HTTP 500/);
    await expect(reader.read("https://a.example/long")).rejects.toThrow(/Page limit/);
  });
});
