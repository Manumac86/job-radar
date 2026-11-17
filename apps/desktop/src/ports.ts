// Before starting, make sure the ports are free (desktop-app spec, "Port taken"; design D4).
import { createServer } from "node:net";

export function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** True when a Job Radar worker answers on this port. */
export async function isJobRadar(port: number, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = (await res.json()) as { app?: string; ok?: boolean };
    return body.app === "job-radar" || (body.ok === true && "profile" in body);
  } catch {
    return false;
  }
}

export type PortProblem = { port: number; role: "web" | "worker"; message: string };

/** Null when both ports are free; otherwise what to tell the owner. */
export async function checkPorts(
  ports: { web: number; worker: number },
  deps: { free?: typeof isPortFree; jobRadar?: (port: number) => Promise<boolean> } = {},
): Promise<PortProblem | null> {
  const free = deps.free ?? isPortFree;
  const jobRadar = deps.jobRadar ?? ((p: number) => isJobRadar(p));
  const otherRadar = await jobRadar(ports.worker);
  for (const [role, port] of [
    ["worker", ports.worker],
    ["web", ports.web],
  ] as const) {
    if (await free(port)) continue;
    return {
      port,
      role,
      message: otherRadar
        ? `Another Job Radar seems to be running (port ${port} is in use). If it is the Docker stack, stop it with \`docker compose down\` and open the app again.`
        : `Port ${port} (${role}) is in use by another program. Free it or change "${role}Port" in desktop.json.`,
    };
  }
  return null;
}
