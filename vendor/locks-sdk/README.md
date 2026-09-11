# Vendored `@pubky/locks-sdk`

**The build artifacts are not in this directory yet.** Only `package.json` is, so that
`npm ci` resolves the `file:` dependency and the Dockerfile's `COPY vendor` step has
something to copy. `next build` will still fail on the missing exports until the WASM output
below is dropped in.

The SDK is Rust compiled to WASM and is not published to any registry
([`pubky/locks`](https://github.com/pubky/locks) `locks-sdk/bindings/js`). Vendoring it is
what lets the image build at all: the previous instruction was to copy the package into
`node_modules` by hand, which `npm ci` erases on every container build.

## Regenerating

Needs a Rust toolchain with the `wasm32-unknown-unknown` target and `wasm-pack`.

```bash
git clone https://github.com/pubky/locks
cd locks/locks-sdk/bindings/js
npm run build                                    # wasm-pack build --target web --out-dir pkg
cp pkg/* <pubky-app>/vendor/locks-sdk/
```

Then, in `vendor/locks-sdk/`:

1. **Delete the `.gitignore` wasm-pack writes.** It contains `*`, so every generated file is
   ignored and the vendored package silently commits as empty.
2. **Keep the `name` as `@pubky/locks-sdk`.** wasm-pack generates `locks-sdk-wasm` from the
   crate name; the import path in `src/` is the scoped name, so the generated `package.json`
   must be renamed or overwritten with the one already here.
3. Check `main` / `module` / `types` / `files` match the emitted filenames — they follow the
   crate name (`locks_sdk_wasm*`) and will change if the crate is renamed.
4. Re-run `npm install --package-lock-only` in the repo root if the version changed.

`pubky/locks#42` is merged, so `master` carries the `Locks.hasPaykitDataWithOptions` API the
payment wallet gate needs — no PR branch required.

## This is temporary

Vendoring keeps a binary in git and a version synced by hand. The destination is publishing
the package to a registry, after which this directory and the `file:` dependency both go
away and `npm ci` resolves the SDK like any other package. See the follow-up issue.
