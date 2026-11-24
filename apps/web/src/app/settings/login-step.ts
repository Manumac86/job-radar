export interface LoginStep {
  message: string;
  viewerUrl: string | null;
}

/**
 * What the sessions panel shows once "Log in" has started (remote-access spec). Opened through
 * another address, such as the tailnet name, the login still happens on the Mac: no link to a
 * 127.0.0.1 address, which may not open on this device, but the message says where to go.
 */
export function loginStep(remote: boolean, started: LoginStep): LoginStep {
  if (!remote) return started;
  return {
    message: started.viewerUrl
      ? `On the Mac, open ${started.viewerUrl}, log in with your password manager and 2FA, then click Done.`
      : "A login window opened on the Mac, with the isolated profile. Log in there, then click Done.",
    viewerUrl: null,
  };
}
