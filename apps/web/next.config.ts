import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const config: NextConfig = {
  // Docker builds a self-contained server (design D10); local runs use `next start`.
  ...(process.env["BUILD_STANDALONE"] === "1" ? { output: "standalone" as const } : {}),
  outputFileTracingRoot: root,
  // Workspace packages ship TypeScript sources.
  transpilePackages: ["@job-radar/core", "@job-radar/db"],
  // Native module: loaded by Node at runtime, never bundled.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
};

export default config;
