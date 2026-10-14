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
#     and `next build` can read;
#   - the semantic build args (NEXT_PUBLIC_DB_VERSION, DB_NAME, DEBUG_MODE),
#     implicitly: they are set in build-docker-image.yml, which is hashed;
#   - build-docker-image.yml, because the rest of its build plumbing (tags,
#     cache, platform wiring) can change the image too;
#   - this script, so a contract change re-tags;
#   - the target platform (argument).
#
# Deliberately excluded:
#   - cypress/: the specs never change the image. The one coupling is that the
#     repo-wide tsconfig include makes `next build` type-check them, and that
#     is enforced separately by the Build workflow gate on every PR, so a
#     cypress-only push safely reuses the image and skips the rebuild;
#   - NEXT_PUBLIC_APP_VERSION (per-commit label, accepted for e2e) and the
#     Sentry source-map credentials (upload metadata, not image behaviour);
#   - the base image: `node:lts-alpine` is a mutable tag, invisible to the
#     hash. Bump SALT below to force a re-tag when it moves.
set -euo pipefail

platform="${1:?usage: docker-content-tag.sh <platform>}"

# Bump to force new content tags for build inputs the hash cannot see (the
# mutable node:lts-alpine base image).
SALT=1

{
  git ls-tree -r HEAD -- \
    Dockerfile .dockerignore package.json package-lock.json \
    next.config.ts tsconfig.json postcss.config.mjs components.json \
    public src \
    .github/workflows/build-docker-image.yml \
    .github/scripts/docker-content-tag.sh
  printf 'platform=%s\n' "$platform"
  printf 'salt=%s\n' "$SALT"
} | sha256sum | cut -c1-40
