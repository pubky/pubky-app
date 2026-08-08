import { LocksApplication } from '@/application/locks/locks';
import type {
  TCreateLockContentParams,
  TFetchOwnContentParams,
  TFetchReplicatedContentParams,
  TFetchUnlockedContentParams,
  TReplicateUnlockedContentParams,
  TUnlockContentParams,
} from '@/application/locks/locks.types';
import { isAppError, isAuthError } from '@/libs/error/error.utils';
import { sleep } from '@/libs/utils/utils';
import { LockContentParser, LockFileParser } from '@/pipes/locks/locks.parser';
import type {
  LockPostContent,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TFetchLockFileParams,
  TFetchLockFileResult,
  TGetConnectUrlParams,
  TLocksSessionResult,
  TUnlockedContent,
  TUnlockResult,
} from '@/services/locks/locks.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/** How long logout waits for the Lock Server before it gives up and clears the device anyway. */
const SIGNOUT_TIMEOUT_MS = 3000;

/**
 * Entry point for the Lock Server: auth (mirrors `AuthController`), publishing locked content
 * (creator), and reading a lock's public `lock.json` (reader).
 */
export class LocksController {
  private constructor() {} // Prevent instantiation

  /**
   * Builds the `/connect` URL to load in the iframe auth modal.
   *
   * `returnTo` is the parent origin. There is no navigation to it — the Lock Server uses it to target
   * the `postMessage` and the `frame-ancestors` CSP, so it must be in `allowed_return_origins`.
   */
  static getConnectUrl({ state }: TGetConnectUrlParams): Promise<string> {
    const returnTo = window.location.origin;
    return LocksApplication.generateConnectUrl({ returnTo, state });
  }

  /**
   * True when the Lock Server is reachable + ready.
   *
   * `/readyz` needs the server's HTTP origin, which the SDK only exposes by building a connect URL —
   * so build a throwaway one just to read its origin; the
   * real auth builds its own URL at "Continue".
   */
  static async isServerReachable(): Promise<boolean> {
    const url = await LocksApplication.generateConnectUrl({
      returnTo: window.location.origin,
      state: crypto.randomUUID(),
    });
    return LocksApplication.isServerReady(new URL(url).origin);
  }

  /**
   * Completes auth from a validated callback: exchanges the one-time code for a session and
   * persists it (bearer secret) to the store.
   */
  static async completeAuthFromCallback(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    const result = await LocksApplication.exchangeSessionCode(params);
    useLocksAuthStore.getState().init({ session: result.session, secret: result.secret });
    // Register the creator's default Lock Server pointer in the background on every auth, mirroring
    // the homeserver's post-auth write. Fire-and-forget: a failure (already reported to Sentry by the
    // service Err factory) must not drop the established session — the write is idempotent and
    // retried on the next auth. Runs after `init` — the service reads the session it just persisted.
    void LocksApplication.setLockServiceConfig().catch(() => {});
    return result;
  }

  /**
   * Tears down the Locks session as part of unified pubky.app logout: revokes the frontend session on
   * the Lock Server (best-effort) then clears the local store. Invoked from `AuthController` cleanup so
   * one logout drops both the homeserver and Locks sessions.
   */
  static async logout(): Promise<void> {
    const store = useLocksAuthStore.getState();
    if (store.selectLocksSession()) {
      try {
        // A server that accepts the connection but never answers would otherwise hold logout for as
        // long as the OS takes to give up, leaving cookies and the local database in place.
        await Promise.race([LocksApplication.signout(), sleep(SIGNOUT_TIMEOUT_MS)]);
      } catch {
        // Already reported to Sentry by the service Err factory; swallow so local teardown runs.
      }
    }
    store.reset();
  }

  /**
   * Clears the Locks session locally. Does not call the Lock Server.
   *
   * Call this when the server rejects the session (HTTP 401) — `signout` would be rejected too.
   * Restoring a session makes no network call, so a stale secret keeps the UI looking signed in until
   * the next creator call fails.
   */
  static clearSession(): void {
    useLocksAuthStore.getState().reset();
  }

  /**
   * On app load, rebuilds the live Locks session from the persisted bearer secret, then validates it
   * against the Lock Server. No-op if nothing to restore or a session is already live.
   *
   * `restoreSession` is offline, so a server-expired secret would rebuild a session that looks live —
   * the composer would show "authenticated", let the creator configure a lock, and only surprise them
   * with a sign-in prompt when publishing makes the first real call. The SDK exposes no read to probe
   * with, so validate via the idempotent config write: a rejected session (401 → Auth) is cleared now.
   * Other failures (network / 5xx) keep the session — they don't prove it's dead.
   */
  static async restorePersistedLocksSession(): Promise<void> {
    const store = useLocksAuthStore.getState();
    if (!store.selectLocksSessionSecret() || store.selectLocksSession() !== null) return;

    try {
      store.setSession(await LocksApplication.restoreSession());
    } catch {
      // Malformed/stale secret — already reported by the service Err factory; clear it so the UI
      // shows unauthenticated rather than a broken session.
      this.clearSession();
      return;
    }

    try {
      await LocksApplication.setLockServiceConfig();
    } catch (error) {
      if (isAppError(error) && isAuthError(error)) this.clearSession();
    }
  }

  /**
   * Publishes one content lock from the composer's files. The upload/bundle workflow lives in
   * `LocksApplication.createLockContent`.
   */
  static createLockContent(params: TCreateLockContentParams): Promise<TCreateContentLockResult> {
    return LocksApplication.createLockContent(params);
  }

  /**
   * Fetch the lock file (`lock.json`) referenced by a post's top-level `lock` URL and resolve how
   * its content is gated. Delegates to the application, which validates the URL and performs the read.
   */
  static async fetchLockFile(params: TFetchLockFileParams): Promise<TFetchLockFileResult> {
    const lockFile = await LocksApplication.fetchLockFile(params);
    return { lockFile, verifierType: LockFileParser.resolveVerifierType(lockFile) };
  }

  /** Announcement content of a lock post; null when the post's `content` isn't valid announcement JSON. */
  static getLockContent(content: string): LockPostContent | null {
    return LockContentParser.parse(content);
  }

  /** Reader unlock: submit the proof for a resolved lock file, verify, and return the access credential. */
  static unlock(params: TUnlockContentParams): Promise<TUnlockResult> {
    return LocksApplication.unlockContent(params);
  }

  /** Reads the guarded post + attachments after unlock, using the access credential. */
  static fetchUnlockedContent(params: TFetchUnlockedContentParams): Promise<TUnlockedContent> {
    return LocksApplication.fetchUnlockedContent(params);
  }

  /** Copies unlocked content into the reader's own `/priv`, so later reads need no credential. */
  static replicateUnlockedContent(params: TReplicateUnlockedContentParams): Promise<void> {
    return LocksApplication.replicateUnlockedContent(params);
  }

  /** Loads already-unlocked content from the reader's `/priv`, or null if this lock isn't unlocked yet. */
  static fetchReplicatedContent(params: TFetchReplicatedContentParams): Promise<TUnlockedContent | null> {
    return LocksApplication.fetchReplicatedContent(params);
  }

  /** Creator reads their own locked content directly from the guarded original (owner == signed-in). */
  static fetchOwnContent(params: TFetchOwnContentParams): Promise<TUnlockedContent> {
    return LocksApplication.fetchOwnContent(params);
  }
}
