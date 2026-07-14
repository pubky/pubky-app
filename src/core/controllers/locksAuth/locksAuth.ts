import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksAuthApplication } from '@/application/locksAuth/locksAuth';
import type {
  TExchangeSessionCodeParams,
  TGetConnectUrlParams,
  TLocksServerParams,
  TLocksSessionResult,
} from '@/services/locksAuth/locksAuth.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/**
 * Entry point for Lock Server auth. Mirrors `AuthController`.
 */
export class LocksAuthController {
  private constructor() {} // Prevent instantiation

  /**
   * Builds the `/connect` URL to load in the iframe auth modal.
   *
   * `returnTo` is the parent origin. There is no navigation to it — the Lock Server uses it to target
   * the `postMessage` and the `frame-ancestors` CSP, so it must be in `allowed_return_origins`.
   */
  static getConnectUrl({ lockServerPubky, state }: TGetConnectUrlParams): Promise<string> {
    const returnTo = window.location.origin;
    return LocksAuthApplication.generateConnectUrl({ lockServerPubky, returnTo, state });
  }

  /**
   * Completes auth from a validated callback: exchanges the one-time code for a session and
   * persists it (bearer secret) to the store.
   */
  static async completeAuthFromCallback(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    const result = await LocksAuthApplication.exchangeSessionCode(params);
    useLocksAuthStore.getState().init({ session: result.session, secret: result.secret });
    // Register the creator's default Lock Server pointer in the background on every auth, mirroring
    // the homeserver's post-auth write. Fire-and-forget: a failure must not drop the established
    // session (the pointer write is idempotent and retried on the next auth).
    void this.registerLockServiceConfig(result.session, params.lockServerPubky);
    return result;
  }

  /** Background lock-service-config write; reports failures to Sentry but never drops the session. */
  private static async registerLockServiceConfig(session: LocksSdkSession, defaultLockServer: string): Promise<void> {
    try {
      await LocksAuthApplication.setLockServiceConfig(session, defaultLockServer);
    } catch {
      // Already reported to Sentry by the service Err factory; swallow so the write (idempotent,
      // retried on the next auth) never drops the established session.
    }
  }

  /**
   * Tears down the Locks session as part of unified pubky.app logout: revokes the frontend session on
   * the Lock Server (best-effort) then clears the local store. Invoked from `AuthController` cleanup so
   * one logout drops both the homeserver and Locks sessions.
   */
  static async logout(): Promise<void> {
    const store = useLocksAuthStore.getState();
    const session = store.selectLocksSession();
    if (session) {
      try {
        await LocksAuthApplication.signout(session);
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
   * On app load, rebuilds the live Locks session from the persisted bearer secret.
   * No-op if nothing to restore or a session is already live. A malformed/stale secret is cleared so
   * the UI shows unauthenticated rather than a broken session. Restore is local (no network), so no
   * retry is needed.
   */
  static async restorePersistedLocksSession({ lockServerPubky }: TLocksServerParams): Promise<void> {
    const store = useLocksAuthStore.getState();
    const secret = store.selectLocksSessionSecret();
    if (!secret || store.selectLocksSession() !== null) return;

    try {
      store.setSession(await LocksAuthApplication.restoreSession({ lockServerPubky, secret }));
    } catch {
      // Malformed/stale secret — already reported by the service Err factory; clear it so the UI
      // shows unauthenticated rather than a broken session.
      store.reset();
    }
  }
}
