#!/usr/bin/env bash
# Decides how much of the unit suite (vitest project "unit") a Tests run executes.
#
#   full      every test file, 5 shards, with coverage (the pre-existing behaviour)
#   affected  only the test files whose import graph reaches a changed file, plus
#             the tests that read the filesystem, without coverage
#   none      no unit test can be affected (e.g. a docs- or e2e-only change)
#
# Only a pull_request into dev can be anything but full. dev merges through the
# merge queue, whose merge_group run is always full, so nothing that lands via
# the queue reaches dev without every unit test passing on the exact merged
# tree; a selection miss on a PR is caught there, never after merge. An admin
# bypass merge skips the merge_group run, so it lands having passed only the
# affected subset; that is accepted because test.yml runs the full suite on
# every push to dev, so a break shows up on dev right after landing. Branches
# without a merge queue (master, feature branches) get no such backstop, so
# their PRs run full, as do merge_group, push and workflow_dispatch.
#
# The selection itself is Vitest's own `--changed` resolver (Vitest 5): it walks
# the transformed module graph (tsconfig aliases included), respects vi.mock, and
# selects everything when a setup file or the Vitest config changes. This script
# only adds the cases that resolver does not see, and falls back to full whenever
# it is unsure. Falling back to full is always the safe direction.
#
# Usage (CI): BASE=<commit> bash .github/scripts/plan-unit-tests.sh
#   BASE defaults to HEAD^1, i.e. the base side of a pull_request merge commit.
#   BASE_REF is the PR's target branch (github.base_ref); only dev allows selection.
#   UNIT_TEST_SELECTION=full forces full (repository variable; the rollback switch).
# Writes mode, shards, shard_total and files to $GITHUB_OUTPUT when set, and a
# summary to $GITHUB_STEP_SUMMARY when set. Runs locally too (prints the plan).
set -euo pipefail

# Above this many selected files the subset saves little, so run the full,
# sharded suite (with coverage) instead.
MAX_AFFECTED=300
# Selected files per shard in affected mode (the full suite runs ~200 per shard).
FILES_PER_SHARD=150

BASE="${BASE:-HEAD^1}"
EVENT="${GITHUB_EVENT_NAME:-local}"
# The branch whose merge queue runs the full suite before anything lands.
QUEUED_BRANCH=dev

out() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "$1" >> "$GITHUB_OUTPUT"
  fi
}

summary() {
  echo "$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

plan() {
  local mode="$1" reason="$2" files_json="${3:-[]}"
  local shards='[1,2,3,4,5]' total=5
  if [ "$mode" != full ]; then
    local n
    n=$(jq 'length' <<< "$files_json")
    total=$(( (n + FILES_PER_SHARD - 1) / FILES_PER_SHARD ))
    if [ "$total" -lt 1 ]; then total=1; fi
    shards=$(jq -c -n --argjson t "$total" '[range(1; $t + 1)]')
  fi
  if [ "$mode" = none ]; then
    shards='[]'
    total=0
  fi
  out "mode=$mode"
  out "shards=$shards"
  out "shard_total=$total"
  out "files=$files_json"
  summary "### Unit test plan: \`$mode\`"
  summary ""
  summary "$reason"
  if [ "$mode" = affected ]; then
    summary ""
    summary "<details><summary>$(jq 'length' <<< "$files_json") test files</summary>"
    summary ""
    jq -r '.[] | "- `" + . + "`"' <<< "$files_json" | while IFS= read -r line; do summary "$line"; done
    summary "</details>"
  fi
  exit 0
}

if [ "${UNIT_TEST_SELECTION:-}" = full ]; then
  plan full "Forced by \`UNIT_TEST_SELECTION=full\`."
fi
if [ "$EVENT" != pull_request ] && [ "$EVENT" != local ]; then
  plan full "\`$EVENT\` runs always execute the full suite."
fi
if [ "$EVENT" = pull_request ] && [ "${BASE_REF:-}" != "$QUEUED_BRANCH" ]; then
  plan full "Pull requests into \`${BASE_REF:-?}\` merge without a full merge-queue run, so they run the full suite."
fi
if ! git rev-parse --verify --quiet "$BASE^{commit}" > /dev/null; then
  plan full "Base \`$BASE\` is not available, so the diff is unknown."
fi

# --- Changes the module graph cannot see -----------------------------------
#  - dependencies and toolchain: Vitest does not track node_modules, and
#    package-lock.json is not in its default force-rerun triggers;
#  - test infrastructure: this script, the workflow, the install action;
#  - __mocks__ folders (module-level automocks are not import edges);
#  - deleted or renamed source files: a test still importing a removed module
#    has no edge to it in the current tree;
#  - public/ assets: read at runtime (e.g. the OG fallback image), never
#    imported, so no import edge can select their tests.
FORCE_FULL='^(package\.json|package-lock\.json|\.npmrc|\.nvmrc|patches/|tsconfig[^/]*\.json$|vitest\.config\.|vite\.config\.|next\.config\.|postcss\.config\.|\.github/workflows/test\.yml$|\.github/scripts/plan-unit-tests\.sh$|\.github/actions/install-dependencies/)|(^|/)__mocks__/'

# Paths no unit test can depend on: docs and agent files, e2e specs, VRT tests and
# baselines (their own vitest project), other CI files. Everything else outside
# src/ and public/ is unknown, and unknown means full.
IRRELEVANT='^(docs/|\.agents/|\.claude/|\.codex/|\.cursor/|\.greptile/|cypress/|\.github/|\.husky/|src/test/vrt/)|\.md$|\.vrt\.test\.tsx?$'

changed=$(git diff --name-only "$BASE" HEAD)
if [ -z "$changed" ]; then
  plan none "No files changed relative to \`$BASE\`."
fi

forced=$(grep -E "$FORCE_FULL" <<< "$changed" || true)
if [ -n "$forced" ]; then
  plan full "Changed files the module graph does not track:$(printf '\n- `%s`' $forced)"
fi

public_changed=$(grep -E '^public/' <<< "$changed" || true)
if [ -n "$public_changed" ]; then
  plan full "Changed files under \`public/\` (read at runtime, outside the module graph):$(printf '\n- `%s`' $public_changed)"
fi

removed=$(git diff --name-only --diff-filter=DR "$BASE" HEAD -- 'src/**' | grep -vE '\.test\.tsx?$' || true)
if [ -n "$removed" ]; then
  plan full "Deleted or renamed source files (a test may still import them):$(printf '\n- `%s`' $removed)"
fi

unknown=$(grep -vE "$IRRELEVANT" <<< "$changed" | grep -vE '^(src|public)/' || true)
if [ -n "$unknown" ]; then
  plan full "Changed files outside \`src/\` and \`public/\` with no known relation to unit tests:$(printf '\n- `%s`' $unknown)"
fi

# --- Vitest's own selection ------------------------------------------------
list_err=$(mktemp)
if ! selected=$(npx vitest list --project unit --filesOnly --changed "$BASE" 2> "$list_err"); then
  cat "$list_err" >&2
  plan full "\`vitest list --changed\` failed, so the selection is unknown."
fi
# `[unit] path` lines; anything else (warnings) is ignored.
selected=$(sed -nE 's/^\[unit\] (.+)$/\1/p' <<< "$selected")

# Tests that read files from disk depend on inputs that are not imports (source
# files they scan, public/manifest.json, ...). They are cheap, so always run them.
fs_tests=$(git grep -lE "readFileSync|readdirSync|readFile\(|fs/promises|from '(node:)?fs'" -- 'src/**/*.test.ts' 'src/**/*.test.tsx' || true)

files=$(printf '%s\n%s\n' "$selected" "$fs_tests" | grep -vE '^$' | sort -u || true)
n_selected=$(grep -c . <<< "$selected" || true)
n=$(grep -c . <<< "$files" || true)

if [ "$n_selected" -eq 0 ] && [ -z "$(grep -E '^(src|public)/' <<< "$changed" | grep -vE "$IRRELEVANT" || true)" ]; then
  plan none "Only files no unit test depends on changed."
fi
if [ "$n" -gt "$MAX_AFFECTED" ]; then
  plan full "$n test files are affected (over $MAX_AFFECTED), so the full suite runs."
fi

files_json=$(jq -R -s -c 'split("\n") | map(select(length > 0))' <<< "$files")
plan affected "$n_selected test files are affected by the change, plus $(grep -c . <<< "$fs_tests" || true) that read the filesystem. The full suite still runs in the merge queue." "$files_json"
