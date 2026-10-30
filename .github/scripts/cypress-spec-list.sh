#!/usr/bin/env bash
# Turns the e2e-staging workflow_dispatch `specs` input (comma-separated
# Cypress spec file names, e.g. "posts.cy.ts,feed.cy.ts") into the `spec`
# argument for the cypress-io/github-action step, prefixed with e2e/ because
# the action runs with cypress/ as its working directory.
#
# Every entry is validated against cypress/e2e up front, so a typo fails
# before the app build rather than after it. Run from the repository root;
# appends `spec=<list>` to $GITHUB_OUTPUT (prints it when unset, for local
# runs).
set -euo pipefail

input="${1:?usage: cypress-spec-list.sh <comma-separated spec file names>}"
spec_dir="cypress/e2e"

specs=()
IFS=',' read -r -a entries <<< "$input"
for entry in "${entries[@]}"; do
  # Tolerate "a.cy.ts, b.cy.ts" spacing in the dispatch form.
  name="${entry//[[:space:]]/}"
  if [ -z "$name" ]; then
    continue
  fi
  if [[ "$name" == */* ]]; then
    echo "::error::Pass bare spec file names (e.g. posts.cy.ts), not paths: '$name'."
    exit 1
  fi
  if [ ! -f "$spec_dir/$name" ]; then
    echo "::error::Spec '$name' not found in $spec_dir. Available specs:"
    ls "$spec_dir"/*.cy.ts | xargs -n1 basename
    exit 1
  fi
  specs+=("e2e/$name")
done

if [ "${#specs[@]}" -eq 0 ]; then
  echo "::error::The specs input is empty; pass at least one spec file name from $spec_dir."
  exit 1
fi

joined="$(IFS=,; echo "${specs[*]}")"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "spec=$joined" >> "$GITHUB_OUTPUT"
else
  echo "spec=$joined"
fi
echo "Resolved ${#specs[@]} spec(s) to run sequentially: $joined"
