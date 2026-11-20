#!/usr/bin/env bash
set -euo pipefail

# Override the clone URLs with read-only local mirrors to verify offline.
portable_repo=${PORTABLE_REPO:-https://github.com/coreyphillips/beignet-portable-engine.git}
upstream_repo=${BEIGNET_REPO:-https://github.com/coreyphillips/beignet.git}
portable_commit=c90f5f05a367c7192bcff704c16ef71ad57b3400
previous_upstream=fbdd109ec47f7e479cc6cae9cdf9c69c1d132465
upstream_commit=b60b9d22d40a12a3cd45e1cff096c6146aadad26
vendor_dir=$(cd "$(dirname "$0")" && pwd)
build_root=$(mktemp -d "${TMPDIR:-/tmp}/pubky-portable.XXXXXX")
echo "Verifying in $build_root"

git clone --quiet --no-checkout --no-hardlinks "$portable_repo" "$build_root/source"
cd "$build_root/source"
git checkout --quiet --detach "$portable_commit"
git fetch --quiet --no-tags "$upstream_repo" refs/tags/v0.43.6
test "$(git rev-parse 'FETCH_HEAD^{commit}')" = "$upstream_commit"
git diff "$previous_upstream" "$upstream_commit" -- src | git apply --3way
git apply --unidiff-zero "$vendor_dir/portable-0.43.6-metadata.patch"

npm ci --ignore-scripts --no-audit --no-fund
npm run check:types
npm test
npm pack --pack-destination "$build_root" --silent
cmp "$build_root/beignet-portable-engine-0.1.0.tgz" "$vendor_dir/beignet-portable-engine-0.43.6.tgz"
echo "The rebuilt archive matches the wallet dependency byte for byte."
