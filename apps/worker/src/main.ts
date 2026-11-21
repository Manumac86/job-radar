import { createApp } from "./app";
import { createWorker } from "./bootstrap";
import { config } from "./config";
import { log } from "./log";
import { setupTestMode, TEST_MODE } from "./test-mode";

const testing = setupTestMode();
const worker = createWorker(
  testing
    ? {
        llmClient: testing.llmClient,
        researchClient: testing.researchClient,
        newPageReader: testing.newPageReader,
        mailConnect: testing.mailConnect,
      }
    : {},
);
if (TEST_MODE) log.warn("TEST MODE: schedules off, fake LLM, manual runs only");
else worker.start();

const app = createApp(worker);
const server = app.listen(config.port, config.host, () => {
  log.info("worker listening", { host: config.host, port: config.port });
});

async function shutdown(signal: string) {
  log.info("worker stopping", { signal });
  // A login window left open would keep the isolated profile locked after a restart.
  await worker.browser.finishLogin().catch(() => null);
  worker.stop();
  server.close(() => {
    worker.db.$client.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
