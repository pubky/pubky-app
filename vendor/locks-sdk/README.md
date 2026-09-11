# Vendored `@pubky/locks-sdk`

WASM build output of [`pubky/locks`](https://github.com/pubky/locks)
`locks-sdk/bindings/js`, committed here because the SDK is published to no registry.

Built from `pubky/locks` master with wasm-pack 0.13.1 and the repo's pinned Rust 1.91.1
(`rust-toolchain.toml`), which already declares the `wasm32-unknown-unknown` target.

`package.json` is wasm-pack's own output with one edit: `name` is `@pubky/locks-sdk` rather
than the generated `locks-sdk-wasm`, because that is the specifier `src/` imports.

## Why vendored rather than installed

`package.json` declares `"@pubky/locks-sdk": "file:vendor/locks-sdk"`, and the Dockerfile
copies `vendor/` in before `npm ci`. The previous instruction was to copy the package into
`node_modules` by hand, which cannot survive a container build — the dependency stage runs
`npm ci`, which wipes `node_modules` first. A `file:` dependency survives it: npm symlinks
it, bun copies it, and both resolve.

## Regenerating

```bash
git clone --depth 1 https://github.com/pubky/locks
cd locks/locks-sdk/bindings/js
npm run build                       # wasm-pack build --target web --out-dir pkg
cp pkg/locks_sdk_wasm* <pubky-app>/vendor/locks-sdk/
```

Then, in `vendor/locks-sdk/`:

1. **Do not copy `pkg/.gitignore`.** wasm-pack writes one containing a single `*`, which
   silently excludes every file here and leaves the package empty in git.
2. **Keep `name` as `@pubky/locks-sdk`** in `package.json`. wasm-pack regenerates it as
   `locks-sdk-wasm` from the crate name, and the imports in `src/` would stop resolving.
3. If `version` changed, update the `vendor/locks-sdk` entry in `package-lock.json` to match,
   or `npm ci` will refuse the lockfile.

No Rust toolchain locally? The build runs in a container:

```bash
docker run --rm -i rust:1.91.1-bookworm sh -c '
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh >&2
  git clone --depth 1 https://github.com/pubky/locks /src >&2
  cd /src/locks-sdk/bindings/js && wasm-pack build --target web --out-dir pkg >&2
  tar -cf - -C pkg .' > pkg.tar
```

## This is temporary

Vendoring keeps a 1.2 MB binary in git and a version synced by hand. Publishing the SDK to a
registry replaces this directory and the `file:` dependency with an ordinary version pin.
