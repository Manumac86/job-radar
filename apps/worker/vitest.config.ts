import { defineConfig } from "vitest/config";

// Worker tests are written in Madrid time; the app time zone is configurable, so pin it here
// to keep the tests independent of the machine's zone.
export default defineConfig({
  test: { env: { JOB_RADAR_TIMEZONE: "Europe/Madrid" } },
});
