import { createServer, type Server } from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import { checkPorts, isJobRadar, isPortFree } from "../src/ports";

const servers: Server[] = [];
afterAll(() => servers.forEach((s) => s.close()));

function listen(body: unknown): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer((_q, r) => r.end(JSON.stringify(body)));
    servers.push(s);
    s.listen(0, "127.0.0.1", () => resolve((s.address() as { port: number }).port));
  });
}

describe("port check", () => {
  it("sees a held port and recognizes a running Job Radar", async () => {
    const radar = await listen({ ok: true, app: "job-radar", profile: "ok" });
    const other = await listen({ hello: "world" });
    expect(await isPortFree(radar)).toBe(false);
    expect(await isJobRadar(radar)).toBe(true);
    expect(await isJobRadar(other)).toBe(false);

    const problem = await checkPorts({ web: 3999, worker: radar });
    expect(problem).toMatchObject({ port: radar, role: "worker" });
    expect(problem?.message).toMatch(/Another Job Radar seems to be running.*docker compose down/);

    const foreign = await checkPorts(
      { web: other, worker: 1 },
      { free: async (p) => p !== other, jobRadar: async () => false },
    );
    expect(foreign?.message).toMatch(/in use by another program.*webPort/);
  });

  it("passes when both ports are free", async () => {
    expect(
      await checkPorts(
        { web: 1, worker: 2 },
        { free: async () => true, jobRadar: async () => false },
      ),
    ).toBeNull();
  });
});
