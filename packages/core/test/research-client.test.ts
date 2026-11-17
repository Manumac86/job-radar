import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  READ_PAGE_TOOL,
  RESEARCH_MAX_TURNS,
  lockedDownSettings,
  researchSettings,
  researchToolGate,
} from "../src/index";

describe("research client settings", () => {
  it("changes only tools, deny list, MCP, turns and the gate", () => {
    const base = lockedDownSettings("/tmp/x");
    const s = researchSettings("/tmp/x", { fake: "server" });
    expect(s.tools).toEqual(["WebSearch"]);
    expect(s.disallowedTools).not.toContain("WebSearch");
    expect(s.disallowedTools).toEqual(
      expect.arrayContaining(["WebFetch", "Bash", "Read", "Write"]),
    );
    expect(s.mcpServers).toEqual({ jobradar: { fake: "server" } });
    expect(s.maxTurns).toBe(RESEARCH_MAX_TURNS);
    expect(s).not.toHaveProperty("allowedTools");
    const { tools, disallowedTools, mcpServers, maxTurns, canUseTool, ...rest } = s;
    const { tools: bt, disallowedTools: bd, mcpServers: bm, maxTurns: bmt, ...baseRest } = base;
    expect(rest).toEqual(baseRest);
    void [tools, disallowedTools, mcpServers, maxTurns, canUseTool, bt, bd, bm, bmt];
    // The default settings are not touched.
    expect(lockedDownSettings("/tmp/x")).toMatchObject({ tools: [], mcpServers: {}, maxTurns: 3 });
  });

  it("allows only web search and read_page", async () => {
    expect(await researchToolGate("WebSearch", { query: "acme" })).toMatchObject({
      behavior: "allow",
    });
    expect(await researchToolGate(READ_PAGE_TOOL, { url: "https://acme.example" })).toMatchObject({
      behavior: "allow",
    });
    for (const name of [
      "WebFetch",
      "Bash",
      "Read",
      "Write",
      "mcp__other__x",
      "mcp__jobradar__submit",
    ])
      expect(await researchToolGate(name, {}), name).toMatchObject({ behavior: "deny" });
  });

  it("is the only place outside the default client that creates a Claude Code provider", () => {
    const root = join(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
          const src = readFileSync(p, "utf8");
          if (/createClaudeCode\(|createAiSdkMcpServer\(|canUseTool/.test(src))
            hits.push(relative(root, p));
        }
      }
    };
    walk(join(root, "..", "packages"));
    walk(join(root, "..", "apps"));
    expect(hits.sort()).toEqual(["core/src/llm/claude-code.ts", "core/src/llm/research-client.ts"]);
  });
});
