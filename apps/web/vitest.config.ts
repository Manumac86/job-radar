import { defineConfig } from "vitest/config";

// Unit tests only; UI tests under tests/ run with Playwright (pnpm test:ui).
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
