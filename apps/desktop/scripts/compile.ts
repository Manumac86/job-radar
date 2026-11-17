// Compiles the Electron main process (ESM) and the sandboxed preload (CommonJS).
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function compileDesktop(): Promise<void> {
  const common = {
    bundle: true,
    platform: "node" as const,
    target: "node22",
    external: ["electron"],
    sourcemap: "linked" as const,
    logLevel: "warning" as const,
  };
  await build({
    ...common,
    entryPoints: [join(root, "src", "main.ts")],
    outfile: join(root, "dist", "main.mjs"),
    format: "esm",
  });
  await build({
    ...common,
    entryPoints: [join(root, "src", "preload.ts")],
    outfile: join(root, "dist", "preload.cjs"),
    format: "cjs",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await compileDesktop();
  console.log("desktop compiled");
}
