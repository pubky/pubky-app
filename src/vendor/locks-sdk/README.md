# Vendored `@pubky/locks-sdk` (WASM)

<!-- TODO:[Locks] #2026 — this whole vendored dir is temporary. Swap to the published
     `@pubky/locks-sdk` npm package once it ships, then delete this directory. -->

Browser JS/WASM bindings for the Pubky Locks Creator SDK, **vendored** because the package is not
yet published to npm (`@pubky/locks-sdk` is `private: true`).

## Source

- Repo: https://github.com/pubky/locks (branch `feat/locks-sdk`)
- Built from commit: `7eedd7e450190aa523d088daaa19728142bfcfa6`
- Build target: `wasm-pack build --target web` (ESM + async wasm init)

## Files

- `locks_sdk_wasm.js` — ESM entry: named class exports (`Locks`, `Session`, `ConnectUrlOptions`,
  `ConnectCallback`, `ExchangeFrontendSessionCodeOptions`, …) + default `init()` (async wasm load).
- `locks_sdk_wasm_bg.wasm` — the wasm binary.
- `*.d.ts` — types.

## Usage (client-only)

WASM must NOT be imported into the Next server build — load it client-side only
(see step 4b in `.taehwa-work/Locks/2001-lock-sdk-integration.md`):

```ts
import init, { Locks } from '@/vendor/locks-sdk/locks_sdk_wasm';
await init();               // loads locks_sdk_wasm_bg.wasm
const locks = Locks.forServer(lockServerPubky);
```

## Rebuilding (when the locks branch updates)

```bash
# in a clone of pubky/locks @ feat/locks-sdk
npm --prefix locks-sdk/bindings/js run build   # needs Rust + wasm-pack
# then copy pkg/{locks_sdk_wasm.js,locks_sdk_wasm_bg.wasm,*.d.ts} here
# and update the source commit hash above
```
