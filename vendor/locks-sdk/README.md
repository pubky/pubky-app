# Vendored `@pubky/locks-sdk`

WASM build output of [`pubky/locks`](https://github.com/pubky/locks)
`locks-sdk/bindings/js`, committed here because the SDK is published to no registry.

## Provenance

| | |
|---|---|
| Source | `pubky/locks` @ `34837f8ae516fb1c81fb1aa404517261755e8e44` (tag `v0.1.0-rc4`) |
| Package version | `0.1.0-rc4` |
| Rust | `1.91.1` (the repo's pinned `rust-toolchain.toml`, which declares `wasm32-unknown-unknown`) |
| wasm-pack | `0.13.1` |
| Command | `wasm-pack build --target web --out-dir pkg` |

The source commit is recorded, not reconstructed: the build cloned the `v0.1.0-rc4` tag,
which is lightweight and points straight at `34837f8a`.

`Viewer.lookupPaykitConnectionState` arrives in this revision, added upstream by
`aecc90f0` (locks #54). The previous vendored build predated it, so `src/` calling that
method failed the image build's type check while resolving and installing correctly.

`package.json` is wasm-pack's own output with one edit: `name` is `@pubky/locks-sdk` rather
than the generated `locks-sdk-wasm`, because that is the specifier `src/` imports.

## Why vendored rather than installed

`package.json` declares `"@pubky/locks-sdk": "file:vendor/locks-sdk"`, and the Dockerfile
copies `vendor/` in before `npm ci`. The previous instruction was to copy the package into
`node_modules` by hand, which cannot survive a container build — the dependency stage runs
`npm ci`, which wipes `node_modules` first. A `file:` dependency survives it: npm symlinks
it, bun copies it, and both resolve.

## Regenerating

Pin the revision and the tool. Tracking `master` or "latest wasm-pack" makes the committed
binary unreproducible, and a binary nobody can rebuild is a binary nobody can audit.

```bash
git clone --branch v0.1.0-rc4 https://github.com/pubky/locks
cd locks/locks-sdk/bindings/js
cargo install wasm-pack --version 0.13.1 --locked
wasm-pack build --target web --out-dir pkg
cp pkg/locks_sdk_wasm* <pubky-app>/vendor/locks-sdk/
```

Then, in `vendor/locks-sdk/`:

1. **Do not copy `pkg/.gitignore`.** wasm-pack writes one containing a single `*`, which
   silently excludes every file here and leaves the package empty in git.
2. **Keep `name` as `@pubky/locks-sdk`** in `package.json`. wasm-pack regenerates it as
   `locks-sdk-wasm` from the crate name, and the imports in `src/` would stop resolving.
3. If `version` changed, update the `vendor/locks-sdk` entry in `package-lock.json` to match,
   or `npm ci` will refuse the lockfile.
4. Update the provenance table above, with the commit you actually built.

No Rust toolchain locally? The build runs in a container:

```bash
docker run --rm -i rust:1.91.1-bookworm sh -c '
  git clone --depth 1 --branch v0.1.0-rc4 https://github.com/pubky/locks /src >&2
  cd /src && git rev-parse HEAD >&2
  cargo install wasm-pack --version 0.13.1 --locked >&2
  cd locks-sdk/bindings/js && wasm-pack build --target web --out-dir pkg >&2
  tar -cf - -C pkg .' > pkg.tar
```

## This is temporary

Vendoring keeps a 1.2 MB binary in git and a version synced by hand. Publishing the SDK to a
registry replaces this directory and the `file:` dependency with an ordinary version pin.
