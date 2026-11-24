# Remote access from your phone

Job Radar runs on your Mac and listens only on `127.0.0.1`. To use it from your phone when you
are away, put it behind [Tailscale Serve](https://tailscale.com/kb/1312/serve). Tailscale
gives your Mac a private HTTPS address that only devices on your own tailnet can open, and
forwards it to the app's local web port. Job Radar opens no new port, and nothing is reachable
from the internet.

This is optional, and you run it yourself: Job Radar never starts or changes Tailscale.

## What you need

- Tailscale on the Mac and on the phone, signed in to the same tailnet.
- MagicDNS and HTTPS certificates turned on for the tailnet (Tailscale admin console → DNS).
- The Mac awake, with Job Radar running (the macOS app or Docker).

## Turn it on

On the Mac, run the command for how you run Job Radar:

```bash
# macOS app (web port 3300)
tailscale serve --bg http://127.0.0.1:3300

# Docker (web port 3000)
tailscale serve --bg http://127.0.0.1:3000
```

If you changed the web port (`webPort` in the macOS app's `desktop.json`, or `WEB_PORT` for
Docker), use that port. If Tailscale asks you to enable HTTPS, follow its link and run the
command again.

Tailscale prints your address:

```text
Available within your tailnet:

https://my-mac.tailnet-name.ts.net/
|-- proxy http://127.0.0.1:3300
```

`--bg` keeps it running in the background, and Tailscale remembers it after a restart.

To check it at any time:

```bash
tailscale serve status
```

It must say `(tailnet only)` and show one proxy, to `http://127.0.0.1:3300` (or `:3000`).

## Open it on the phone

With Tailscale connected on the phone, open `https://my-mac.tailnet-name.ts.net` in the
browser. To keep it one tap away, use Share → **Add to Home Screen**.

Always use that `https://` address. Copy buttons need a secure page, and the Mac's Tailscale IP
address (`100.x.y.z`) does not answer at all, because Job Radar only listens on `127.0.0.1`.

## Open Telegram links on the phone

Links in Telegram alerts and in the daily digest point to the Mac's local address by default,
which does not open on the phone. To open them on the phone:

1. In Job Radar, go to **Settings → Preferences → Notifications**.
2. Set **Open links at** to your address, such as `https://my-mac.tailnet-name.ts.net`, and
   save. Enter only the address, without a page path: Job Radar adds the path of each link.

The next messages use it; nothing needs a restart. The Mac is on the tailnet too, so the same
links still open there. Clear the field to go back to the local address. It is stored only in
your profile (`notifications.link_base_url` in `preferences.yaml`).

## Turn it off

```bash
tailscale serve --https=443 off
```

This removes only this address. `tailscale serve reset` removes every Serve setting on the Mac.

## What stays on the Mac

Only the web app goes through Serve. Everything else stays reachable only from the Mac itself:

- **The worker** (port 4000). The web app talks to it from the Mac, so the phone never needs it.
- **Login windows.** **Settings → Sessions → Log in** opens the login window on the Mac (in
  Docker, the login viewer at `127.0.0.1:6080`). Opened through the Tailscale address, the panel
  says so and shows no local link; in Docker it names the viewer address to open on the Mac.
  Finish the login at the Mac.

## Never use Funnel

`tailscale funnel` publishes a port to the whole internet. Never point it at Job Radar: your
offers, CV, drafts and contacts would be open to anyone who finds the address.

As a safety net, Job Radar refuses every request that arrives through Funnel: Tailscale marks
those requests, and the app answers them with an empty `403 Forbidden` on every page. If you
see that error on the phone, run `tailscale funnel status`, then turn Funnel off with
`tailscale funnel --https=443 off`.

## Who can open it

Anyone on your tailnet who can reach the Mac can use Job Radar; there is no separate sign-in. If
other people share your tailnet, use Tailscale access controls (ACLs) so that only your own
devices can reach the Mac.

## Troubleshooting

- **The page does not load.**
  - Check that Tailscale is connected on the phone, and that Job Radar is running on the Mac.
  - Check that `tailscale serve status` shows the proxy.
- **It stopped answering while you were away.** The Mac is probably asleep: Job Radar only
  answers while the Mac is awake. In System Settings, turn on "Prevent automatic sleeping when
  the display is off" (under Energy, or Battery → Options on a laptop).
- **Copy says "Copying needs a secure address".** Open the app through the `https://…ts.net`
  address that `tailscale serve` printed, not through another address: browsers only allow
  copying on secure pages.
