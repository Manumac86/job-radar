## Why

The owner wants to publish Job Radar: show it on the portfolio (manumartinez.dev), let other people download the macOS app, and offer a Docker version. Today the repository forbids any remote and any push, its seed profile is the owner's real CV, preferences and rates, its history contains them, and several schedules and dates are pinned to Europe/Madrid. Another person could not use it as is, and publishing it would leak private data.

## What Changes

- **BREAKING (owner workflow):** the "no git remotes" rule becomes "only the public release remote". The owner's private checkout keeps its full history and may push only a separate `public` branch with its own clean history. Pushing `main` stays blocked.
- A publish command builds the `public` branch from the current tree as a new commit. Before that it checks the tree against the owner's private terms list, which is kept in `secrets/` and never published. It also checks for secret-looking files. Commits use the GitHub noreply address.
- `profile-seed/` becomes a fictional example profile. The owner's real seed moves to the git-ignored data folder. Until the profile is changed, the dashboard and Settings show "This is the example profile" with a link to edit it.
- The app's time zone (daily caps, schedules, dates) comes from the machine, or from `JOB_RADAR_TIMEZONE`, instead of Europe/Madrid.
- Release artifacts:
  - an unsigned Apple Silicon `.dmg` attached to a GitHub release
  - multi-arch Docker images on `ghcr.io/manumac86/job-radar-{web,worker}`
  - a standalone `docker-compose.release.yml` that pulls those images
- The running app still makes no network requests of its own, has no auto-update and no telemetry, and binds only to 127.0.0.1.
- New README for the public (what it does, install with the app or with Docker, first setup, privacy, development), an MIT license, and a portfolio entry on manumartinez.dev.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `local-operation`: remotes are allowed only for the public release, with a privacy-checked publish. The app time zone follows the machine. Public release artifacts are added.
- `candidate-profile`: the bundled seed is a fictional example, and the app says so until the owner replaces it.

## Impact

- Code:
  - `scripts/` (guard, hooks, new publish script)
  - `.githooks/pre-push`
  - `profile-seed/`
  - `packages/core` (time zone)
  - worker and web call sites that use Europe/Madrid
  - the web dashboard and Settings notice
  - `docker-compose*.yml`
- Docs: README, LICENSE, CLAUDE.md rule 1, `openspec/config.yaml`.
- External:
  - a public GitHub repo `Manumac86/job-radar`
  - GHCR packages
  - a GitHub release
  - the portfolio repo `manumartinez-dev` (new project page, deployed by Vercel)
