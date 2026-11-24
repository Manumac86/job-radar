import { NextResponse, type NextRequest } from "next/server";
import { isPublicTunnel } from "@/lib/public-tunnel";

// Runs on every path (no matcher). A request that came through Tailscale Funnel gets 403 with an
// empty body, so a wrong `tailscale funnel` never exposes the app (remote-access spec, D3).
export function proxy(request: NextRequest) {
  if (isPublicTunnel(request.headers)) return new NextResponse(null, { status: 403 });
  return NextResponse.next();
}
