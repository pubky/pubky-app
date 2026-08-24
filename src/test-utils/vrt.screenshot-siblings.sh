#!/usr/bin/env bash
# Fail if a VRT `__screenshots__/<file>/` folder has no sibling `*.vrt.test.tsx`.
# Vitest does not prune baselines when a test file is renamed or deleted.
set -euo pipefail

ROOT="${1:-src/test/vrt}"

if [[ ! -d "$ROOT" ]]; then
  echo "VRT root not found: $ROOT" >&2
  exit 1
fi

dangling=0

while IFS= read -r -d '' screenshots_root; do
  suite_dir="$(dirname "$screenshots_root")"
  for shot_dir in "$screenshots_root"/*; do
    if [[ ! -d "$shot_dir" ]]; then
      continue
    fi
    test_file="$suite_dir/$(basename "$shot_dir")"
    if [[ ! -f "$test_file" ]]; then
      echo "Dangling VRT screenshot folder (no sibling test file):" >&2
      echo "  $shot_dir" >&2
      echo "  expected test file: $test_file" >&2
      echo "  git mv the folder with the test, or git rm -r the folder." >&2
      dangling=1
    fi
  done
done < <(find "$ROOT" -type d -name '__screenshots__' -print0)

if (( dangling != 0 )); then
  exit 1
fi

echo "All VRT screenshot folders have a sibling test file."
