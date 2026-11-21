import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { BUNDLE_OPTIONS } from "../scripts/bundle";

const run = promisify(execFile);

describe("bundled worker: Telegram", () => {
  // Regression: the app bundle renamed the AbortSignal polyfill, so node-fetch refused grammY's
  // signal and every Telegram call failed with "Network request for '<method>' failed!".
  it("grammY reaches the Bot API from a bundle built with the app's options", async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          result: { id: 1, is_bot: true, first_name: "Radar", username: "radar_bot" },
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const outfile = join(mkdtempSync(join(tmpdir(), "job-radar-tg-")), "entry.mjs");
      await build({
        ...BUNDLE_OPTIONS,
        entryPoints: [join(import.meta.dirname, "fixtures", "telegram-bundle-entry.ts")],
        outfile,
      });
      const { stdout } = await run(process.execPath, [outfile], {
        env: { PATH: process.env["PATH"], API_ROOT: `http://127.0.0.1:${port}` },
      });
      expect(JSON.parse(stdout.trim())).toEqual({
        ok: true,
        username: "radar_bot",
        native: "function",
      });
    } finally {
      server.close();
    }
  }, 60_000);
});
