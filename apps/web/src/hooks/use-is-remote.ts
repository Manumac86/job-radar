import { useSyncExternalStore } from "react";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** True for any host other than the Mac's own addresses, such as a tailnet name. */
export function isRemoteHost(hostname: string): boolean {
  return !LOCAL_HOSTS.has(hostname.toLowerCase());
}

// The address never changes while a page is open.
const subscribe = () => () => {};

/**
 * True when the UI was opened from another device, through the owner's private-network proxy
 * (remote-access spec, design D4). Always false on the server.
 */
export function useIsRemote(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isRemoteHost(window.location.hostname),
    () => false,
  );
}
