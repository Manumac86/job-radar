# Tasks

## 1. Private data out of the tree

- [x] 1.1 Replace `profile-seed/` with a fictional example: a CV and preferences for Alex Rivera, with the same company list. Copy the owner's real seed to `data/profile-seed-owner/`. Update the tests that referenced the owner's CV and experience, and the `openspec/config.yaml` context. Verified by `pnpm verify` and by a grep of the tree for the owner's terms that returns nothing.
- [x] 1.2 An "example profile" notice on the dashboard and in Settings while the CV holds the example marker line, linking to `/settings?tab=profile`. A demo seed (`pnpm --filter @job-radar/web demo:seed`) is added for screenshots. Verified by a core unit test and a Playwright test.

## 2. Time zone

- [x] 2.1 `appTimeZone()` in core (`JOB_RADAR_TIMEZONE`, then the runtime zone, then UTC). Replace every hard-coded Europe/Madrid in core, worker and web. Client components use the browser zone. Compose passes `TZ`. Verified by a core unit test (env override, fallback), the existing budget, telegram and pipeline tests run with `JOB_RADAR_TIMEZONE=Europe/Madrid`, and a grep that finds no Europe/Madrid outside tests and the example.

## 3. Publishing guards

- [x] 3.1 `check:local` and the pre-push hook honor `jobradar.private`: only the `public` remote, only `public` → `main`, and no ancestor in the private history. Public clones are unrestricted. Verified by script tests on temp repos (private flag, other remote, `main` push refused, `public` push allowed, unmarked clone allowed).
- [x] 3.2 `pnpm publish:sync`: privacy scan (`secrets/private-terms.txt`, secret-path patterns), then a commit-tree onto `public` with the noreply identity. The hook reruns the scan. Verified by script tests (term found → refused with file and term, clean → one commit with an equal tree).

## 4. Release artifacts and docs

- [x] 4.1 `docker-compose.release.yml` (images from GHCR, `TZ`, ports on 127.0.0.1) and `pnpm release:images` (buildx for amd64 and arm64, push). Verified by `docker compose -f docker-compose.release.yml config` and by pulling the pushed images.
- [x] 4.2 README for the public, LICENSE (MIT), CLAUDE.md rule 1 and the `openspec/config.yaml` context updated. Verified by review.
- [x] 4.3 Rebuild the `.dmg` from the clean tree and check it for private terms (a strings scan of `app.asar` and the resources). Verified by an empty scan and `pnpm desktop:smoke`.

## 5. Publish

- [x] 5.1 Create the public repo `Manumac86/job-radar`, set `jobradar.private`, run `publish:sync`, and push `public` → `main`. Then create release v0.1.0 with the `.dmg` and the release compose file, and push the images. Verified by `gh release view` and by an anonymous `docker pull`.
- [x] 5.2 Portfolio entry `job-radar` (en and es, screenshots with fictitious data, links to the repo and the release) in `manumartinez-dev`. Verified by the portfolio build and tests, then pushed to main.
- [x] 5.3 Owner check: download the `.dmg` from the release on a clean user account (or after moving the app's data aside), start fresh, and see the example profile. The Docker release compose starts. The portfolio page shows the project.
