// `pnpm release:images <version>`: builds the web and worker images for linux/amd64 and
// linux/arm64 from the published `public` branch only (a `git archive`, so untracked and private
// files can never reach an image) and pushes them to ghcr.io (public-release design D6).
// Needs `docker login ghcr.io` with a token that has write:packages.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: pnpm release:images <version>   (e.g. 0.1.0)");
  process.exit(1);
}
const REGISTRY = "ghcr.io/manumac86";
const ctx = mkdtempSync(join(tmpdir(), "job-radar-release-"));
try {
  execFileSync("sh", ["-c", `git archive public | tar -x -C "${ctx}"`], { stdio: "inherit" });
  for (const name of ["web", "worker"]) {
    const image = `${REGISTRY}/job-radar-${name}`;
    execFileSync(
      "docker",
      [
        "buildx",
        "build",
        "--platform",
        "linux/amd64,linux/arm64",
        "--file",
        join(ctx, "docker", `${name}.Dockerfile`),
        "--tag",
        `${image}:${version}`,
        "--tag",
        `${image}:latest`,
        "--label",
        "org.opencontainers.image.source=https://github.com/Manumac86/job-radar",
        "--label",
        "org.opencontainers.image.licenses=MIT",
        "--push",
        ctx,
      ],
      { stdio: "inherit" },
    );
  }
} finally {
  rmSync(ctx, { recursive: true, force: true });
}
