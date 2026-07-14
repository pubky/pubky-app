/**
 * One-time locks-sdk WASM initialization.
 *
 * The `pkg` build of the SDK (wasm-pack `--target web`) exposes a default-exported `init()` that
 * must run before any SDK class is used — unlike `@synonymdev/pubky` / `pubky-app-specs`, which
 * self-initialize on import. Services await this at their entry points so callers stay unchanged.
 * When the module has no default init (self-initializing build, or a test mock) this is a no-op.
 *
 * TODO: This init() only exists because the SDK is shipped as the web build. If the SDK is
 * published as a bundler or self-contained (base64-inlined) build instead, wasm initializes on
 * import and this whole file becomes unnecessary — the app would just `import` the SDK like the
 * other wasm deps. Prefer that; ask the SDK maintainers to ship it self-contained. Reference for
 * the self-contained approach (pubky-app-specs #60):
 * https://github.com/pubky/pubky-app-specs/pull/60/changes#diff-028ca4d711c47ae908581ec9a46af068ac895940de4c76e845234e61bc06b3d7
 */
let ready: Promise<void> | null = null;

export function ensureLocksSdkReady(): Promise<void> {
  if (!ready) {
    ready = import('@pubky/locks-sdk').then(async (sdk) => {
      // `in` first: test mocks throw on reading an export they do not define.
      if (!('default' in sdk)) return;
      const init = (sdk as { default?: () => Promise<unknown> }).default;
      if (typeof init === 'function') await init();
    });
  }
  return ready;
}
