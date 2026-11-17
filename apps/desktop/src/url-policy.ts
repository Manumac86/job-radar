// What the app window may load (desktop-app spec, "App window"; design D3).

/** The app's own pages: its localhost web server and the bundled loading screen. */
export function isAppUrl(raw: string, webPort: number, loadingFile?: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "file:") return Boolean(loadingFile) && url.pathname === loadingFile;
  return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === String(webPort);
}

/** Links that may be handed to the default browser; everything else is dropped. */
export function isExternalAllowed(raw: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(raw).protocol);
  } catch {
    return false;
  }
}

export type NavigationDecision = "allow" | "external" | "deny";

export function decideNavigation(
  raw: string,
  webPort: number,
  loadingFile?: string,
): NavigationDecision {
  if (isAppUrl(raw, webPort, loadingFile)) return "allow";
  return isExternalAllowed(raw) ? "external" : "deny";
}
