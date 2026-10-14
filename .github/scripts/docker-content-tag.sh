#!/usr/bin/env bash
# Computes the e2e content tag for the pubky-app image: a hash of every input
# the Docker build can consume, so an e2e run can reuse an already-built image
# only when the image it would build is unchanged.
#
# Single implementation, used by build-docker-image.yml (tag_mode: content)
# and e2e-test.yml (image wait) — do not fork this logic.
#
# Contract coverage:
#   - every tracked file the build context (`COPY . .` minus .dockerignore)
#     and `next build` can read, including cypress/ (the repo-wide tsconfig
#     include makes it part of type-checking);
#   - the semantic build args and the base image, implicitly: both are pinned
#     in the Dockerfile (ARG defaults, FROM digest), which is hashed;
#   - build-docker-image.yml, because its build-args can still override the
#     Dockerfile ARG defaults (keep semantic values in the Dockerfile so
#     plumbing edits here rarely bust the tag);
#   - this script, so a contract change re-tags;
#   - the target platform (argument).
#
# Deliberately excluded: NEXT_PUBLIC_APP_VERSION (per-commit label, accepted
# for e2e) and the Sentry source-map credentials (upload metadata, not image
# behaviour).
set -euo pipefail

platform="${1:?usage: docker-content-tag.sh <platform>}"

{
  git ls-tree -r HEAD -- \
    Dockerfile .dockerignore package.json package-lock.json \
    next.config.ts tsconfig.json postcss.config.mjs components.json \
    public src cypress \
    .github/workflows/build-docker-image.yml \
    .github/scripts/docker-content-tag.sh
  printf 'platform=%s\n' "$platform"
} | sha256sum | cut -c1-40
