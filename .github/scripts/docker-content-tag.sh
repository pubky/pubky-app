#!/usr/bin/env bash
# Computes the e2e content tag for the pubky-app image: a hash of the build
# inputs, so an e2e run can reuse an already-built image only when the image
# it would build is unchanged.
#
# Single implementation, used by build-docker-image.yml (tag_mode: content)
# and e2e-test.yml (image wait) — do not fork this logic.
#
# Contract: every tracked file is hashed except the short exclude list below,
# so a new build input is covered by default. Rebuilding too often is the
# safe failure; a missing input would silently reuse a stale image. Keep the
# list in step with the e2e-test.yml paths filter (which runs on cypress/).
#
# Excluded, because none of it reaches the image:
#   - cypress/: the specs never change the image. The one coupling is that the
#     repo-wide tsconfig include makes `next build` type-check them, and that
#     is enforced separately by the Build workflow gate on every PR;
#   - docs/, the agent/AI folders and *.md files;
#   - workflows other than e2e-test.yml (passes the build its inputs) and
#     build-docker-image.yml (carries the build args).
# Also outside the hash: NEXT_PUBLIC_APP_VERSION (per-commit label, accepted
# for e2e), the Sentry source-map credentials (upload metadata, not image
# behaviour), and the mutable `node:lts-alpine` base — bump SALT below to
# force a re-tag when it moves.
#
# The `e2e-` prefix keeps content tags distinguishable from commit SHAs in
# the registry.
set -euo pipefail

platform="${1:?usage: docker-content-tag.sh <platform>}"

# Bump to force new content tags for build inputs the hash cannot see (the
# mutable node:lts-alpine base image).
SALT=1

hash=$(
  {
    git ls-tree -r HEAD | awk -F '\t' '
      $2 ~ /^(cypress|docs|\.agents|\.claude|\.codex|\.cursor|\.greptile)\// { next }
      $2 ~ /\.md$/ { next }
      $2 ~ /^\.github\/workflows\// && $2 != ".github/workflows/e2e-test.yml" && $2 != ".github/workflows/build-docker-image.yml" { next }
      { print }
    '
    printf 'platform=%s\n' "$platform"
    printf 'salt=%s\n' "$SALT"
  } | sha256sum | cut -c1-40
)

printf 'e2e-%s\n' "$hash"
