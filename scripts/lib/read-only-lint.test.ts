import { ESLint } from "eslint";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const lint = async (code: string, file: string) => {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath: join(root, file) });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message);
};

describe("read-only lint rule (design D4)", () => {
  it("fails on raw interaction calls in packages/sources", async () => {
    for (const call of [
      'page.click("#apply")',
      'page.fill("#q", "x")',
      "page.locator('a').press('Enter')",
      "page.evaluate(() => 1)",
      "page.$eval('a', (e) => e)",
    ]) {
      const messages = await lint(
        `export async function f(page: any) { await ${call}; }\n`,
        "packages/sources/src/adapters/probe.ts",
      );
      expect(messages[0], call).toMatch(/read-only on third-party sites/);
    }
  });

  it("allows reading through the wrapper, and the guard's own pagination click", async () => {
    expect(
      await lint(
        'export async function f(p: any) { await p.goto("u"); await p.html(); await p.safeClick("#next"); }\n',
        "packages/sources/src/adapters/probe.ts",
      ),
    ).toEqual([]);
    expect(
      await lint(
        "export async function f(t: any) { await t.click(); }\n",
        "packages/sources/src/browser/guard.ts",
      ),
    ).toEqual([]);
  });
});
