# Publishing a release

Job Radar is developed in a private checkout whose history is never published. The public
repository gets a separate `public` branch with its own history (public-release change, design
D1–D3).

## One-time setup (private checkout only)

```bash
git config jobradar.private true
git config jobradar.publicName "<your name>"
git config jobradar.publicEmail "<id>+<login>@users.noreply.github.com"
git remote add public git@github.com:Manumac86/job-radar.git
# secrets/private-terms.txt: one private term per line (name, email, employers, ...)
```

With `jobradar.private` set, `pnpm check:local` accepts only the `public` remote and the
pre-push hook accepts only `public` → `main`. The hook also refuses any commit from the private
history and reruns the privacy scan. Public clones are not restricted.

## Each release

```bash
pnpm verify
pnpm publish:sync "Release 0.4.0"     # privacy scan, then one commit on `public`
git push public public:main
pnpm desktop:build                    # → apps/desktop/build/release/Job Radar-<v>-arm64.dmg
pnpm release:images 0.4.0             # web + worker for amd64/arm64 → ghcr.io (needs docker login)
gh release create v0.4.0 --repo Manumac86/job-radar --target main \
  "apps/desktop/build/release/Job Radar-0.4.0-arm64.dmg#Job-Radar-0.4.0-arm64.dmg" \
  docker-compose.release.yml
```

Before uploading, scan the `.dmg` contents for private terms (see the `public-release` tasks).
