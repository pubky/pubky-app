# Hotfix Process

How to cut a **patch** onto the current production line (for example `1.7.0` → `1.7.1`) **without** taking `dev` HEAD.

A hotfix uses the same merge, tag, and back-merge pipeline as a full release. Follow [release.md](./release.md) for those shared steps. This document covers only what is different.

## When to use

Production needs a fix that must not wait for the next `dev` cut, and must not ship unrelated work already on `dev`.

```
v1.7.0 (master) ── release-1.7.1 (cherry-picks) ── merge commit ──► master
                         ▲                              │
              commits from `dev`                        ├── git tag v1.7.1
              or a hotfix branch                        └── back-merge ──► `dev`
```

Do not rebase the hotfix onto `dev`. That would pull in `dev` HEAD, which is the situation a hotfix is avoiding.

Substitute `1.7.1` / `v1.7.1` with the patch being released.

## 1. Branch from the previous release

Start from the production tag (or `master`, if that is still the previous release), not from `dev`:

```bash
git fetch origin
git checkout -b release-1.7.1 v1.7.0
git push -u origin release-1.7.1
```

Same `release-<semver>` naming as a [full release](./release.md#2-create-the-release-branch-from-dev).

## 2. Cherry-pick the fix

Pick one or more commits from `dev`, or from a hotfix branch:

```bash
git cherry-pick -x <commit>
git push origin release-1.7.1
```

Repeat for each commit, or pass a range (`<oldest>^..<newest>`). `-x` records the original SHA.

If the fix is not on `dev` yet, develop it on a branch based on the previous release (this candidate can be that branch), then continue from here. If a cherry-pick from `dev` does not apply cleanly, the commit likely depends on unreleased `dev` work — take a version of the fix that was based on the previous release instead.

You can still cherry-pick further commits onto `release-1.7.1` during the candidate window. Do not rebase onto `dev`. Freeze the branch before the version bump.

## 3. Draft PR, checks, version bump, merge, tag, back-merge

From here, follow [release.md](./release.md):

1. [Open a draft PR into `master`](./release.md#3-open-a-draft-pr-into-master) (`release-1.7.1` → `master`).
2. [Make the pipelines green](./release.md#4-make-the-pipelines-green). The latest `dev` [VRT and e2e](./release.md#vrt-and-e2e) run is **not** enough: it includes unreleased `dev` work. Trigger VRT and e2e on this candidate, or confirm they pass for this set of commits.
3. [Bump `package.json` `version`](./release.md#bump-packagejson-version) to the patch (for example `1.7.1`), then [merge with a merge commit](./release.md#merge-with-a-merge-commit). Never squash, never rebase-and-merge.
4. [Tag `master`](./release.md#7-tag-master-and-push) as `v1.7.1` and push. That publishes the image as in [What the tag publishes](./release.md#what-the-tag-publishes).
5. [Back-merge `master` into `dev`](./release.md#8-back-merge-master-into-dev).

The back-merge diff depends on where the fix came from:

- Cherry-picks that already live on `dev`: the only file change should be the version bump (same as a full release).
- Commits that existed only on a hotfix branch: those changes **and** the version bump. That is how `dev` receives the fix.

## Checklist

- [ ] Branched from the previous release tag (or `master`), not from `dev` HEAD
- [ ] Fix cherry-picked from `dev` or a hotfix branch (`-x`)
- [ ] Draft PR opened: `release-<patch>` → `master`
- [ ] PR checks green (tests, build, code quality)
- [ ] VRT and e2e green for this candidate (do not rely on the latest `dev` run)
- [ ] `package.json` (and `package-lock.json`) bumped to the patch version and pushed
- [ ] PR marked ready; merged with **Create a merge commit** (not squash, not rebase-and-merge)
- [ ] Annotated tag `v<patch>` created on `master` and pushed
- [ ] Docker Hub image build for the tag succeeded
- [ ] PR `master` → `dev` opened and merged with a merge commit
- [ ] Hotfix / release branch deleted
