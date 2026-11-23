## Context

Job Radar was built as a private, local-only tool. The owner now wants it public. The rules that protected their data (no remote, a pre-push hook that refuses everything) must keep protecting the private history, while allowing a clean public copy. Other users must be able to run it with their own profile and in their own time zone.

## Goals / Non-Goals

**Goals:**
- No private data in the public repository, its history, the `.dmg` or the Docker images.
- Another person can install the `.dmg` (Apple Silicon) or run Docker, set up their own profile, and use it.
- Publishing again later is one command, and it can never push the private history.

**Non-Goals:**
- Code signing or notarization (it needs a paid Apple Developer ID). The app stays unsigned and the README explains how to open it.
- An Intel `.dmg`. Intel Macs use Docker.
- Auto-update, or any network call from the app beyond what it already does.
- A CI pipeline. Releases are built on the owner's machine.

## Decisions

### D1. A separate `public` branch with its own history, in the same checkout
`pnpm publish:sync` creates a commit whose tree is `HEAD^{tree}` and whose parent is the current `public` tip (`git commit-tree`). It then moves `refs/heads/public` to it. The first commit has no parent. `main`'s history therefore never reaches `public`, and no checkout switch is needed.
- *Alternatives:*
  - Rewriting history with filter-repo: it keeps the OpenSpec history, but one missed file leaks everything.
  - A second clone: two working copies drift apart.

### D2. Private mode is a local git config flag
`git config jobradar.private true` is set only on the owner's machine and is never versioned. With it set:
- `check:local` accepts only a remote named `public` that points to `github.com/Manumac86/job-radar`.
- The pre-push hook accepts only `refs/heads/public` → `refs/heads/main` on that remote.
- The hook refuses a pushed commit that has `main`'s root commit as an ancestor.

Without the flag (public clones and forks), remotes and pushes are ordinary.
- *Alternative:* removing the guards. That would protect nothing the next time a push is attempted from the private checkout.

### D3. Privacy scan from a private terms file
`secrets/private-terms.txt` (git-ignored) holds one term per line: name, email, employers and anything else private. Before it commits, `publish:sync` refuses when any tracked file contains a term (case-insensitive). It also refuses when any tracked path matches a secret pattern (`secrets/`, `data/`, `.env`, `*token*`, `*.pem`, `*.key`). The pre-push hook runs the same scan on the pushed tree.
- *Alternative:* hard-coding the terms. That would publish them.

### D4. Example seed and an "example profile" notice
`profile-seed/` holds a fictional candidate (Alex Rivera, senior full-stack engineer, Lisbon) and a generic company list. The example CV contains one marker line ("This is the example profile that ships with Job Radar"). While the live CV still contains it, the dashboard and Settings show a notice with a link to the profile editor. The web reads the CV file directly, so no worker change is needed. The owner's real seed is copied to `data/profile-seed-owner/` (git-ignored), so nothing is lost.
- *Alternative:* an empty profile. Validation would fail, and scoring would not start until the user filled every field.

### D5. App time zone from the machine
`appTimeZone()` in `@job-radar/core` returns `JOB_RADAR_TIMEZONE` if it is set, else the runtime zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), else `UTC`. It replaces every hard-coded Europe/Madrid. Client components use the browser zone. The desktop app inherits the Mac's zone. Docker passes `TZ` from `.env`, with a default of UTC.
- *Alternative:* the profile's `owner.timezone`. The web would then need the profile before rendering any date, and the budget day would change when the owner edits the profile.

### D6. Images and release compose
`docker buildx build --platform linux/amd64,linux/arm64 --push` publishes `ghcr.io/manumac86/job-radar-web` and `-worker`, tagged with the version and `latest`. `docker-compose.release.yml` uses only `image:` entries and is uploaded as a release asset. The repo compose keeps `build:` for development. The `.dmg` is attached with `gh release create`. electron-builder keeps `publish: null`, because uploading is a separate, manual step.

### D7. Public commit identity
Public commits use `<id>+<login>@users.noreply.github.com`, so the owner's personal email is never published.

## Risks / Trade-offs

- [The terms list misses something] → the scan also covers patterns from the example seed. The owner reviews the term list, and the first publish prints the file list for review.
- [Unsigned app: Gatekeeper warning] → the README documents right-click → Open and `xattr -dr com.apple.quarantine`.
- [Images built under QEMU for amd64 are slow to build] → this only affects release time.
- [Other users need a Claude subscription and the Claude Code CLI] → the README states this upfront.
