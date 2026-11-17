// Starts and watches the worker and the web server (desktop-app spec, "Native app without
// Docker"; design D1). Children run on Electron's own Node (ELECTRON_RUN_AS_NODE=1).
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

export interface ProcessSpec {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  /** Polled until it answers 2xx. */
  healthUrl: string;
  logFile: string;
}

export type ProcessState = "starting" | "running" | "restarting" | "stopped" | "failed";

export interface SupervisorOptions {
  spawn?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
  fetch?: (url: string) => Promise<{ ok: boolean }>;
  now?: () => number;
  healthTimeoutMs?: number;
  healthIntervalMs?: number;
  maxRestarts?: number;
  restartWindowMs?: number;
  killAfterMs?: number;
  backoffMs?: number;
  logMaxBytes?: number;
  logFiles?: number;
}

/** Appends to a log file, rotating at a size limit and keeping the last lines in memory. */
export class RotatingLog {
  private readonly tail: string[] = [];
  constructor(
    private readonly file: string,
    private readonly maxBytes = 5_000_000,
    private readonly files = 5,
    private readonly keep = 50,
  ) {
    mkdirSync(dirname(file), { recursive: true });
  }

  write(chunk: string): void {
    for (const line of chunk.split("\n")) {
      if (!line) continue;
      this.tail.push(line);
      if (this.tail.length > this.keep) this.tail.shift();
    }
    if (existsSync(this.file) && statSync(this.file).size + chunk.length > this.maxBytes)
      this.rotate();
    appendFileSync(this.file, chunk);
  }

  lastLines(): string[] {
    return [...this.tail];
  }

  private rotate(): void {
    rmSync(`${this.file}.${this.files - 1}`, { force: true });
    for (let i = this.files - 2; i >= 1; i--)
      if (existsSync(`${this.file}.${i}`)) renameSync(`${this.file}.${i}`, `${this.file}.${i + 1}`);
    renameSync(this.file, `${this.file}.1`);
  }
}

interface Managed {
  spec: ProcessSpec;
  child: ChildProcess | null;
  state: ProcessState;
  crashes: number[];
  log: RotatingLog;
  error: string | null;
}

export class Supervisor {
  private readonly procs = new Map<string, Managed>();
  private readonly listeners: ((name: string, state: ProcessState) => void)[] = [];
  private stopping = false;
  private readonly o: Required<SupervisorOptions>;

  constructor(specs: ProcessSpec[], options: SupervisorOptions = {}) {
    this.o = {
      spawn: options.spawn ?? nodeSpawn,
      fetch: options.fetch ?? ((url) => fetch(url, { signal: AbortSignal.timeout(2000) })),
      now: options.now ?? Date.now,
      healthTimeoutMs: options.healthTimeoutMs ?? 60_000,
      healthIntervalMs: options.healthIntervalMs ?? 300,
      maxRestarts: options.maxRestarts ?? 3,
      restartWindowMs: options.restartWindowMs ?? 10 * 60_000,
      killAfterMs: options.killAfterMs ?? 8_000,
      backoffMs: options.backoffMs ?? 1_000,
      logMaxBytes: options.logMaxBytes ?? 5_000_000,
      logFiles: options.logFiles ?? 5,
    };
    for (const spec of specs)
      this.procs.set(spec.name, {
        spec,
        child: null,
        state: "stopped",
        crashes: [],
        log: new RotatingLog(spec.logFile, this.o.logMaxBytes, this.o.logFiles),
        error: null,
      });
  }

  /** New environment for the next start of a process (e.g. another Claude CLI path). */
  updateEnv(name: string, env: Record<string, string>): void {
    const m = this.procs.get(name);
    if (m) m.spec = { ...m.spec, env };
  }

  spec(name: string): ProcessSpec | undefined {
    return this.procs.get(name)?.spec;
  }

  onChange(fn: (name: string, state: ProcessState) => void): void {
    this.listeners.push(fn);
  }

  state(name: string): ProcessState {
    return this.procs.get(name)?.state ?? "stopped";
  }

  error(name: string): string | null {
    return this.procs.get(name)?.error ?? null;
  }

  lastLines(name: string): string[] {
    return this.procs.get(name)?.log.lastLines() ?? [];
  }

  /** Starts every process in order, each one healthy before the next. */
  async start(): Promise<void> {
    this.stopping = false;
    for (const m of this.procs.values()) await this.launch(m);
  }

  /** Manual "Restart" after a failure: resets the crash count. */
  async restart(name: string): Promise<void> {
    const m = this.procs.get(name);
    if (!m) return;
    this.stopping = false;
    m.crashes = [];
    await this.kill(m);
    await this.launch(m);
  }

  /** SIGTERM to every child, SIGKILL to those still alive after `killAfterMs`. */
  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.procs.values()].map((m) => this.kill(m)));
  }

  private set(m: Managed, state: ProcessState): void {
    m.state = state;
    for (const l of this.listeners) l(m.spec.name, state);
  }

  private async launch(m: Managed): Promise<void> {
    this.set(m, m.crashes.length ? "restarting" : "starting");
    m.error = null;
    const child = this.o.spawn(m.spec.command, m.spec.args, {
      cwd: m.spec.cwd,
      env: m.spec.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    m.child = child;
    child.stdout?.on("data", (d: Buffer) => m.log.write(d.toString()));
    child.stderr?.on("data", (d: Buffer) => m.log.write(d.toString()));
    child.on("exit", (code, signal) => {
      if (m.child !== child) return;
      m.child = null;
      if (this.stopping || m.state === "stopped") return this.set(m, "stopped");
      m.log.write(`[supervisor] ${m.spec.name} exited (code ${code}, signal ${signal})\n`);
      void this.onCrash(m);
    });
    const healthy = await this.waitHealthy(m, child);
    if (m.child !== child) return; // exited while starting; onCrash handles it
    if (healthy) return this.set(m, "running");
    m.error = `${m.spec.name} did not answer within ${Math.round(this.o.healthTimeoutMs / 1000)} s`;
    await this.kill(m, true);
    this.set(m, "failed");
  }

  private async onCrash(m: Managed): Promise<void> {
    const now = this.o.now();
    m.crashes = [...m.crashes.filter((t) => now - t < this.o.restartWindowMs), now];
    if (m.crashes.length > this.o.maxRestarts) {
      m.error = `${m.spec.name} stopped after ${this.o.maxRestarts} restarts in ${Math.round(this.o.restartWindowMs / 60_000)} minutes`;
      return this.set(m, "failed");
    }
    this.set(m, "restarting");
    await new Promise((r) => setTimeout(r, this.o.backoffMs * 2 ** (m.crashes.length - 1)));
    if (!this.stopping) await this.launch(m);
  }

  private async waitHealthy(m: Managed, child: ChildProcess): Promise<boolean> {
    const deadline = this.o.now() + this.o.healthTimeoutMs;
    while (this.o.now() < deadline) {
      if (m.child !== child) return false;
      const ok = await this.o
        .fetch(m.spec.healthUrl)
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) return true;
      await new Promise((r) => setTimeout(r, this.o.healthIntervalMs));
    }
    return false;
  }

  private async kill(m: Managed, keepState = false): Promise<void> {
    const child = m.child;
    if (!child || child.exitCode !== null) {
      m.child = null;
      if (!keepState) this.set(m, "stopped");
      return;
    }
    // Detach first, so the exit handler does not count this as a crash.
    m.child = null;
    const exited = new Promise<void>((r) => child.once("exit", () => r()));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), this.o.killAfterMs);
    await exited;
    clearTimeout(timer);
    if (!keepState) this.set(m, "stopped");
  }
}
