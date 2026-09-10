# Release Process

How to cut a production release from `dev` onto `master`.

The goal is that **`master` and `dev` share the same commit history** after the release. That only holds if the release PR is merged with a **merge commit** — never squash, never rebase-and-merge.

Pushing a `v*` tag from `master` is what publishes the production Docker image (see [What the tag publishes](#what-the-tag-publishes)).

For a patch on the current production line **without** taking `dev` HEAD, see [hotfix.md](./hotfix.md).

## Overview

```
dev  ──────────────────────────────────────────────────────────────►
      \                                              ▲
       release-1.8.0  ── merge commit ──►  master ───┘  back-merge
                              │
                              └── git tag v1.8.0 (push)
```

1. Wait until `dev` is in (or near) a ready state for the promised release work.
2. Create a branch named `release-<version>` from `dev` (for example `release-1.8.0`).
3. Open a **draft** GitHub PR merging the release branch into `master`.
4. Make every pipeline check green, including VRT and e2e. Fix failures before cutting.
5. During this window the branch is a **release candidate**. Bring in further `dev` work by rebasing onto `dev`, or by cherry-picking individual commits when not everything on `dev` should ship.
6. When ready, bump `package.json` `version` on the release branch, then merge into `master` with a **merge commit** (do **not** squash).
7. Create the tag locally on `master` (for example `v1.8.0`) and push it.
8. Open a PR merging `master` into `dev` and merge it. The only file change should be the version bump.

Substitute `1.8.0` / `v1.8.0` with the version being released.

## 1. Confirm `dev` is ready

Start when `dev` contains the work the team promised for the release, or is close enough that remaining items can land during the candidate window.

- `dev` CI is green (unit tests, build, code quality).
- Recent pushes to `dev` have passing **VRT** and **e2e** (those workflows run on push to `dev`; see [VRT and e2e](#vrt-and-e2e)).
- No known blockers that must ship in this version.

Feature work can still land on `dev` after the candidate is cut — pick it up by rebasing or cherry-picking (step 5).

## 2. Create the release branch from `dev`

```bash
git fetch origin
git checkout dev
git pull --ff-only origin dev
git checkout -b release-1.8.0
git push -u origin release-1.8.0
```

Branch name: `release-<semver>` (no `v` prefix). The git tag in step 7 uses the `v` prefix.

## 3. Open a draft PR into `master`

```bash
gh pr create --draft --base master --head release-1.8.0 \
  --title "Release 1.8.0" \
  --body "$(cat <<'EOF'
## Summary

- Release candidate for 1.8.0, cut from `dev`.

## Merge

- Merge with **Create a merge commit**.
- Do **not** squash. Do **not** rebase-and-merge.

EOF
)"
```

Keep the PR in **draft** until you are ready to cut. Checks still run on draft PRs.

The PR will also get a preview deployment (see `.github/workflows/preview-deploy.yml`). Use that environment for a last look at the candidate.

## 4. Make the pipelines green

Do not merge while any required or release-blocking check is red. Fix failures on `dev`, then rebase or cherry-pick onto the candidate.

### Checks that run automatically on the draft PR

These workflows trigger on `pull_request` (any target branch):

| Workflow     | File                           | What it gates                          |
| ------------ | ------------------------------ | -------------------------------------- |
| Tests        | `.github/workflows/test.yml`   | Unit tests (sharded Vitest)            |
| Build        | `.github/workflows/build.yml`  | Production Next.js build + smoke start |
| Code Quality | `.github/workflows/format.yml` | Prettier, ESLint, TypeScript           |

### VRT and e2e

VRT and e2e **do not** run on pull requests. They run on **push** to `master` and `dev`, and can also be triggered manually.

They should be passing on the commits you are about to ship, either from the latest `dev` run or by triggering the workflows by hand.

| Workflow                | File                             | Notes                                                                                                                        |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Visual Regression Tests | `.github/workflows/vrt.yml`      | Linux and macOS. Failures upload `.vitest-attachments/`. See [visual-regression-testing.md](./visual-regression-testing.md). |
| e2e-test                | `.github/workflows/e2e-test.yml` | Cypress against a dockerised pubky-stack. Failures upload screenshots, videos, and `cypress.log`.                            |

If VRT baselines need regenerating, use the **VRT Update Baselines** workflow from `dev` — never from `master` (the workflow refuses `master`). Land the baseline PR through the normal review path, then rebase or cherry-pick it onto the candidate.

## 5. Keep the candidate aligned with `dev`

Until you merge into `master`, `release-<version>` is a **release candidate**. `dev` may keep moving. Land remaining product work on `dev` first. The only commit that belongs on the release branch itself is the version bump (step 6).

Bring those commits onto the candidate in one of two ways. Prefer one strategy for a given candidate: rebasing after cherry-picks can re-introduce commits you meant to leave out.

### Rebase (all of `dev`)

When the release should include everything currently on `dev`:

```bash
git fetch origin
git checkout release-1.8.0
git rebase origin/dev
git push --force-with-lease origin release-1.8.0
```

Use `--force-with-lease`, not `--force`. After a rebase, wait for PR checks to go green.

### Cherry-pick (selected commits)

When not every commit on `dev` should ship in this release, cherry-pick the ones that should:

```bash
git fetch origin
git checkout release-1.8.0
git cherry-pick -x <commit>
git push origin release-1.8.0
```

`-x` records the original SHA in the commit message. Repeat for each commit, or pass a range (`<oldest>^..<newest>`). Cherry-pick does not need a force-push.

Cherry-picked commits are new SHAs. The `master` → `dev` back-merge (step 8) should still only contain the version bump; it will not be a fast-forward of `dev`. After cherry-picking, confirm VRT and e2e for this set of commits — the latest `dev` run covers the full `dev` tip, not necessarily this subset.

Stop rebasing or cherry-picking once you are about to bump the version and merge into `master`.

## 6. Merge into `master` (never squash)

When the candidate is green and the team is ready to cut, freeze it: no more rebases or cherry-picks.

### Bump `package.json` `version`

This is the only commit authored on the release branch. `next.config.ts` sets `NEXT_PUBLIC_APP_VERSION` from `package.json` `version` when the env var is not already set.

```bash
git checkout release-1.8.0
npm version 1.8.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: bump version to 1.8.0

EOF
)"
git push origin release-1.8.0
```

`--no-git-tag-version` updates `package.json` and `package-lock.json` without creating a git tag (the tag is created on `master` in step 7). Wait for PR checks to go green on this commit.

### Merge with a merge commit

1. Mark the PR ready for review (`gh pr ready`) and get any required approvals.
2. Merge with **Create a merge commit**.

```bash
gh pr merge --merge
```

**Do not squash. Do not rebase-and-merge.**

| GitHub option         | Use it? | Why                                                                                                  |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Create a merge commit | **Yes** | Keeps the original commits. `master` and `dev` can share history.                                    |
| Squash and merge      | **No**  | Replaces the `dev` history with one new commit on `master`. The back-merge then fights that rewrite. |
| Rebase and merge      | **No**  | Rewrites SHAs. `master` would not share exact commits with `dev`.                                    |

This is the cut. `master` now has the release history plus a merge commit. Do not rebase or cherry-pick onto the release branch after this.

## 7. Tag `master` and push

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
git tag -a v1.8.0 -m "v1.8.0"
git push origin v1.8.0
```

Tag **`master`**, annotated, matching `v<semver>`. Do not tag the release branch or `dev`.

Pushing the tag starts [What the tag publishes](#what-the-tag-publishes).

Creating a GitHub Release from the tag is optional. The `v*` tag is what publishes the image.

## 8. Back-merge `master` into `dev`

```bash
git fetch origin
git checkout -b merge-master-into-dev origin/master
git push -u origin merge-master-into-dev
gh pr create --base dev --head merge-master-into-dev \
  --title "Merge master into dev after v1.8.0" \
  --body "$(cat <<'EOF'
## Summary

- Back-merge `master` into `dev` after the v1.8.0 cut so both branches share history.
- The only file change is the `package.json` version bump.

## Merge

- Merge with **Create a merge commit** (or allow a fast-forward).
- Do **not** squash.

The only file change should be the version bump.

EOF
)"
```

You can also open the PR from GitHub: base `dev`, compare `master`.

The file diff should be the version bump only (`package.json` and `package-lock.json`). That is expected: the rest of the commits already live on `dev`; this PR brings across the version commit and the release merge commit so the two branches share history.

Merge with a **merge commit**, not squash. After this, `dev` includes `master` and day-to-day work continues on `dev`.

The `release-<version>` branch can be deleted after this PR is merged.

## What the tag publishes

`.github/workflows/release-docker.yml` runs on push of tags matching `v*`. It builds `linux/arm64` and `linux/amd64` and pushes `synonymsoft/pubky-app` to Docker Hub with the tag name (for example `v1.8.0`) and `latest`.

`next.config.ts` sets `NEXT_PUBLIC_APP_VERSION` from `package.json` `version` unless the env var is already set. Docker CI currently still passes the commit SHA as that build arg, so the published image's Sentry release is the SHA; the SemVer lives in `package.json` and in any build that does not override the env var.

## Release checklist

- [ ] `dev` has the promised work (or remaining work will land on `dev` and be rebased or cherry-picked in)
- [ ] Branch `release-<version>` created from up-to-date `dev` and pushed
- [ ] Draft PR opened: `release-<version>` → `master`
- [ ] PR checks green (tests, build, code quality)
- [ ] VRT green (`dev` run or triggered manually)
- [ ] e2e green (`dev` run or triggered manually)
- [ ] Candidate updated from `dev` if needed (rebase, or cherry-pick if only some commits should ship)
- [ ] `package.json` (and `package-lock.json`) version bumped on the release branch and pushed
- [ ] PR marked ready; merged with **Create a merge commit** (not squash, not rebase-and-merge)
- [ ] Annotated tag `v<version>` created on `master` and pushed
- [ ] Docker Hub image build for the tag succeeded
- [ ] PR `master` → `dev` opened; only file change is the version bump; merged with a merge commit
- [ ] Release branch deleted
