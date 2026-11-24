import { describe, expect, it } from "vitest";
import { isPublicTunnel } from "../public-tunnel";

describe("isPublicTunnel (remote-access spec, design D3)", () => {
  it("is true when Tailscale marks the request as coming through Funnel, in any case", () => {
    expect(isPublicTunnel(new Headers({ "Tailscale-Funnel-Request": "?1" }))).toBe(true);
    expect(isPublicTunnel(new Headers({ "tailscale-funnel-request": "?1" }))).toBe(true);
    expect(isPublicTunnel(new Headers({ "TAILSCALE-FUNNEL-REQUEST": "?1" }))).toBe(true);
  });

  it("is true even when the header is empty: present means refuse", () => {
    expect(isPublicTunnel(new Headers({ "Tailscale-Funnel-Request": "" }))).toBe(true);
  });

  it("is false without the header, including requests from the tailnet", () => {
    expect(isPublicTunnel(new Headers())).toBe(false);
    expect(
      isPublicTunnel(
        new Headers({
          "Tailscale-User-Login": "owner@example.com",
          "X-Forwarded-Host": "my-mac.tailnet-name.ts.net",
        }),
      ),
    ).toBe(false);
  });
});
