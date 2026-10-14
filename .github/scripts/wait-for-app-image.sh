#!/usr/bin/env bash
# Wait for the pubky-app image built for this workflow run to appear in the
# registry under its content tag.
#
# The spec jobs start while rebuild_pubky_app may still be building, so their
# setup overlaps the build; this step is where the two join. The content tag
# always names a linux/amd64 image: the platform is part of the hash and only
# e2e requests content mode. Fails fast when the build job has already
# failed; gives it a short grace once it concluded successfully, since the
# push lands moments after the job completion becomes visible. Times out
# after 20 minutes, matching the build job's own amd64 timeout.
#
# Required environment:
#   GH_TOKEN     token for `gh api` (build-job state)
#   REGISTRY     image registry host
#   CONTENT_TAG  content tag rebuild_pubky_app publishes (tag_mode: content)
#   REPO         owner/name for the actions API (e.g. pubky/pubky-app)
#   RUN_ID       workflow run id for the actions API
set -euo pipefail

for var in GH_TOKEN REGISTRY CONTENT_TAG REPO RUN_ID; do
  if [ -z "${!var:-}" ]; then
    echo "Required environment variable $var is not set."
    exit 1
  fi
done

# Matches the build job's 20min timeout; the build-status check below fails
# fast long before this cap when the build itself has failed.
MAX_WAIT=1200 # Maximum wait time in seconds (20 minutes)
INTERVAL=15
ELAPSED=0
DONE_GRACE=0
IMAGE="$REGISTRY/pubky-app:$CONTENT_TAG"

# failed = the build job ended badly, done = it concluded (the image should
# exist), running = still in progress, anything else (including a transient
# API error) = keep waiting.
build_jobs_state() {
  gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" \
    --jq '[.jobs[] | select(.name | startswith("rebuild_pubky_app / ")) | .conclusion] | if any(. == "failure" or . == "cancelled" or . == "timed_out" or . == "startup_failure") then "failed" elif length == 0 or any(. == null) then "running" else "done" end' \
    2>/dev/null || echo "unknown"
}

# Resolve and log the manifest digest so the exact tested image stays
# identifiable even if a later build overwrites the tag.
log_digest() {
  docker buildx imagetools inspect "$1" 2>/dev/null | awk '/^Digest:/ {print $2; found=1} END {if (!found) print "unknown"}'
}

while true; do
  if docker manifest inspect "$IMAGE" >/dev/null 2>&1; then
    echo "Image available: $IMAGE@$(log_digest "$IMAGE")"
    break
  fi

  STATE=$(build_jobs_state)
  if [ "$STATE" = "failed" ]; then
    echo "The pubky-app build failed; not waiting for an image that will never arrive."
    exit 1
  fi
  if [ "$STATE" = "done" ]; then
    DONE_GRACE=$((DONE_GRACE + 1))
    if [ "$DONE_GRACE" -ge 4 ]; then
      echo "The pubky-app build finished successfully but $IMAGE does not exist in the registry."
      exit 1
    fi
  fi

  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "pubky-app image did not appear within $((MAX_WAIT / 60)) minutes."
    exit 1
  fi
  echo "Waiting for the pubky-app image... ($ELAPSED seconds elapsed)"
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done
