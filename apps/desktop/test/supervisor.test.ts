import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RotatingLog, Supervisor, type ProcessSpec } from "../src/supervisor";

const dir = mkdtempSync(join(tmpdir(), "jr-sup-"));
let port = 4500 + Math.floor(Math.random() * 300);

/** A fake server: starts listening after `delay` ms, optionally exits after `crashAfter` ms. */
function script(name: string, body: string): string {
  const file = join(dir, `${name}.mjs`);
  writeFileSync(file, body);
  return file;
}

function server(opts: { delay?: number; crashAfter?: number; ignoreTerm?: boolean } = {}) {
  const p = port++;
  const file = script(
    `srv-${p}`,
    `import { createServer } from "node:http";
     console.log("booting");
     ${opts.ignoreTerm ? 'process.on("SIGTERM", () => console.log("ignoring SIGTERM"));' : ""}
     setTimeout(() => createServer((_q, r) => r.end("ok")).listen(${p}, "127.0.0.1"), ${opts.delay ?? 0});
     ${opts.crashAfter ? `setTimeout(() => process.exit(3), ${opts.crashAfter});` : ""}`,
  );
  return { file, port: p };
}

function spec(name: string, s: { file: string; port: number }): ProcessSpec {
  return {
    name,
    command: process.execPath,
    args: [s.file],
    env: { PATH: process.env["PATH"] ?? "" },
    cwd: dir,
    healthUrl: `http://127.0.0.1:${s.port}/`,
    logFile: join(dir, "logs", `${name}-${s.port}.log`),
  };
}

const sups: Supervisor[] = [];
afterEach(async () => {
  await Promise.all(sups.map((s) => s.stop()));
  sups.length = 0;
});
const make = (specs: ProcessSpec[], o: ConstructorParameters<typeof Supervisor>[1] = {}) => {
  const s = new Supervisor(specs, { backoffMs: 50, healthIntervalMs: 50, ...o });
  sups.push(s);
  return s;
};

describe("Supervisor", () => {
  it("waits for a slow start, logs output and stops cleanly", async () => {
    const srv = server({ delay: 400 });
    const s = make([spec("worker", srv)]);
    await s.start();
    expect(s.state("worker")).toBe("running");
    expect(s.lastLines("worker")).toContain("booting");
    await s.stop();
    expect(s.state("worker")).toBe("stopped");
    await expect(fetch(`http://127.0.0.1:${srv.port}/`)).rejects.toThrow();
  });

  it("restarts a crashing process, then gives up after 3 restarts", async () => {
    const srv = server({ crashAfter: 300 });
    const s = make([spec("worker", srv)]);
    const states: string[] = [];
    s.onChange((_n, st) => states.push(st));
    await s.start();
    await expect.poll(() => s.state("worker"), { timeout: 10_000 }).toBe("failed");
    expect(states.filter((x) => x === "restarting").length).toBeGreaterThanOrEqual(3);
    expect(s.error("worker")).toMatch(/after 3 restarts in 10 minutes/);
    expect(s.lastLines("worker").some((l) => l.includes("exited (code 3"))).toBe(true);
  });

  it("fails a process that never becomes healthy and kills it", async () => {
    const srv = server({ delay: 60_000 });
    const s = make([spec("web", srv)], { healthTimeoutMs: 500 });
    await s.start();
    expect(s.state("web")).toBe("failed");
    expect(s.error("web")).toMatch(/did not answer/);
  });

  it("kills a child that ignores SIGTERM", async () => {
    const srv = server({ ignoreTerm: true });
    const s = make([spec("worker", srv)], { killAfterMs: 300 });
    await s.start();
    const t = Date.now();
    await s.stop();
    expect(Date.now() - t).toBeLessThan(3000);
    expect(s.state("worker")).toBe("stopped");
  });
});

describe("RotatingLog", () => {
  it("rotates at the size limit and keeps the last lines", () => {
    const file = join(dir, "rot", "x.log");
    const log = new RotatingLog(file, 100, 3, 2);
    for (let i = 0; i < 10; i++) log.write(`line ${i} ${"x".repeat(30)}\n`);
    expect(existsSync(`${file}.1`)).toBe(true);
    expect(existsSync(`${file}.2`)).toBe(true);
    expect(existsSync(`${file}.3`)).toBe(false);
    expect(readFileSync(file, "utf8").length).toBeLessThanOrEqual(100);
    expect(log.lastLines().map((l) => l.slice(0, 6))).toEqual(["line 8", "line 9"]);
  });
});
