/**
 * Tailscale adds this header to requests that reach the Mac through Funnel, from the public
 * internet. `tailscale serve` (tailnet only) never sends it (remote-access spec, design D3).
 */
export const FUNNEL_HEADER = "tailscale-funnel-request";

/** True when the request came through a public tunnel; present, even empty, means refuse. */
export function isPublicTunnel(headers: Headers): boolean {
  return headers.has(FUNNEL_HEADER);
}
