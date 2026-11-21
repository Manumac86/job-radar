// Bundles the worker into one ESM file for the macOS app (macos-app design D2). Packages that
// load native code or locate files at runtime stay external and ship in node_modules.
import { build, type BuildOptions } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKER_EXTERNALS = [
  "better-sqlite3",
  "playwright",
  "playwright-core",
  "ai-sdk-provider-claude-code",
  "@anthropic-ai/claude-agent-sdk",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** esbuild options shared by the app bundle and its tests. */
export const BUNDLE_OPTIONS: BuildOptions = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: WORKER_EXTERNALS,
  // Keep class and function names. Some dependencies check them at runtime: node-fetch v2 (used
  // by grammY) accepts a signal only if its class is named "AbortSignal", and without this esbuild
  // renames the abort-controller polyfill to "AbortSignal2", so every Telegram call fails.
  keepNames: true,
  // CommonJS dependencies inside an ESM bundle still call require().
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "warning",
};

export async function bundleWorker(outfile = join(root, "dist", "worker.mjs")): Promise<string> {
  await build({
    ...BUNDLE_OPTIONS,
    entryPoints: [join(root, "src", "main.ts")],
    outfile,
    sourcemap: "linked",
  });
  return outfile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = await bundleWorker();
  console.log(`worker bundled: ${out}`);
}
