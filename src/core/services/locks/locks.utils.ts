import { Locks, LocksOptions, type Session as LocksSdkSession } from '@pubky/locks-sdk';
import { getLockServer, getPaykitServerUrl, getPkarrRelays } from '@/config/network';
import { AuthErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/**
 * The SDK reports HTTP failures as `Lock Server request failed with HTTP <status>` and exposes no
 * status field, so the string is the only signal. Parse it here, at the IO boundary, and promote a
 * rejected session to a typed auth error the UI can act on (`category === Auth` → re-authenticate).
 * Used by every session-backed call; session-less calls (connect URL, code exchange, restore) keep
 * plain `toAppError` — a 401 there does not mean an expired session.
 */
export function toLocksError(error: unknown, operation: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HTTP 401')) {
    return Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Locks session rejected by the Lock Server', {
      service: ErrorService.Locks,
      operation,
      cause: error,
    });
  }
  return toAppError(error, ErrorService.Locks, operation);
}

/** One-time wasm init promise; see `ensureLocksSdkReady`. */
let sdkReady: Promise<void> | null = null;

/**
 * Runs the locks-sdk's wasm `init()` (its default export) once, on the first call. The `pkg`
 * build of the SDK (wasm-pack `--target web`) requires this before any SDK class is used —
 * unlike `@synonymdev/pubky` / `pubky-app-specs`, which self-initialize on import.
 *
 * TODO:[Locks] #2372 — This only exists because the SDK is shipped as the web build. If the SDK is published
 * as a bundler or self-contained (base64-inlined) build instead, wasm initializes on import and
 * this becomes unnecessary — the app would just `import` the SDK like the other wasm deps. Prefer
 * that; ask the SDK maintainers to ship it self-contained. Reference for the self-contained
 * approach (pubky-app-specs #60):
 * https://github.com/pubky/pubky-app-specs/pull/60/changes#diff-028ca4d711c47ae908581ec9a46af068ac895940de4c76e845234e61bc06b3d7
 */
export function ensureLocksSdkReady(): Promise<void> {
  if (!sdkReady) {
    sdkReady = import('@pubky/locks-sdk')
      .then(async ({ default: init }) => {
        await init();
      })
      .catch((error) => {
        sdkReady = null;
        throw error;
      });
  }
  return sdkReady;
}

/**
 * No Lock Server configured means Locks is off: the composer never renders the lock switch and
 * session restore returns early.
 */
export function getLockServerPubky(): string {
  const lockServerPubky = getLockServer();
  if (!lockServerPubky) {
    throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'No Lock Server configured (Locks disabled)', {
      service: ErrorService.Locks,
      operation: 'getLockServerPubky',
    });
  }
  return lockServerPubky;
}

/**
 * Paykit rejects a setup URL that is not built from an exact origin, so trim anything else the
 * configured value carries. No Paykit Server configured means Locks is disabled.
 */
export function getPaykitServerOrigin(): string {
  const paykitServerUrl = getPaykitServerUrl();
  if (!paykitServerUrl) {
    throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'No Paykit Server configured', {
      service: ErrorService.Locks,
      operation: 'getPaykitServerOrigin',
    });
  }
  return new URL(paykitServerUrl).origin;
}

/**
 * The live Locks session, read from the store (ADR 0004 exception).
 *
 * The composer UI checks the session only once — at the moment the lock switch is flipped. The
 * session can disappear between that check and the actual publish (e.g. logging out in another tab
 * while the Lock Content dialog is still open), so that early check cannot be trusted at call time.
 * Always re-read the store; a missing session becomes a typed auth error the UI answers by
 * reopening sign-in.
 */
export function getLockSession(): LocksSdkSession {
  const session = useLocksAuthStore.getState().selectLocksSession();
  if (!session) {
    throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'No Locks session; sign into the Lock Server first', {
      service: ErrorService.Locks,
      operation: 'getLockSession',
    });
  }
  return session;
}

/**
 * The app's network options (pkarr relays) for any SDK entry point.
 */
export function buildLocksOptions(): LocksOptions {
  const options = new LocksOptions();
  for (const relay of getPkarrRelays()) {
    options.addPkarrRelay(relay);
  }
  return options;
}

/**
 * Builds a Locks client for the configured Lock Server.
 * TODO:[Locks] today there is one server, taken from env. Once multiple lock servers exist,
 * the reader must use each lock's `lock_server.override`; take the server pubky as a param again then.
 */
export function initLockClient(): Locks {
  return Locks.forServerWithOptions(getLockServerPubky(), buildLocksOptions());
}
