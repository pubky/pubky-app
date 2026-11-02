import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { postUriBuilder } from 'pubky-app-specs';
import { LocksApplication } from '@/application/locks/locks';
import type {
  TCreateLockContentParams,
  TDeleteLockContentParams,
  TFetchOwnContentParams,
  TFetchReplicatedAttachmentsParams,
  TFetchReplicatedContentParams,
  TFetchUnlockedListParams,
  TPaymentBundleParams,
  TPaymentLockParams,
  TReplicateUnlockedContentParams,
  TResolvedPurchase,
  TStartPaymentParams,
  TStartPaymentResult,
} from '@/application/locks/locks.types';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, isAuthError } from '@/libs/error/error.utils';
import { sleep, stripPubkyPrefix } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { LockContentParser, LockFileParser } from '@/pipes/locks/locks.parser';
import type {
  LockPostContent,
  ReplicatedPost,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TFetchLockFileParams,
  TFetchLockFileResult,
  TGetConnectUrlParams,
  TGetPaykitSetupUrlParams,
  TLockPriceAsset,
  TLocksSessionResult,
  TPaykitConnectionState,
  TPaykitSetupStatus,
  TUnlockedAttachment,
  TUnlockedContent,
  TUnlockedListItem,
  TVerificationTask,
} from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/** How long logout waits for the Lock Server before it gives up and clears the device anyway. */
const SIGNOUT_TIMEOUT_MS = 3000;

/**
 * Entry point for the Lock Server: auth (mirrors `AuthController`), publishing locked content
 * (creator), reading a lock's public `lock.json` and unlocking it (reader).
 */
export class LocksController {
  private constructor() {} // Prevent instantiation
  /** Bumped before sign-in and when cleared, so older awaits cannot overwrite the latest attempt. */
  private static sessionEpoch = 0;

  /** Setup checks can overlap across dialogs and publishing; only the latest may clear shared readiness. */
  private static paykitSetupGeneration = 0;

  /** An awaited Locks operation belongs to both its app account and its original Locks session. */
  private static captureSessionOwner(): () => boolean {
    const { generation, currentUserPubky } = useAuthStore.getState();
    const epoch = this.sessionEpoch;
    return () => {
      const current = useAuthStore.getState();
      return (
        epoch === this.sessionEpoch &&
        current.generation === generation &&
        current.currentUserPubky === currentUserPubky
      );
    };
  }

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

  /** Builds the Paykit `/setup` URL to load in the payout-account iframe's src. */
  static getPaykitSetupUrl({ state }: TGetPaykitSetupUrlParams): string {
    return LocksApplication.generatePaykitSetupUrl({ returnTo: window.location.origin, state });
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
   * persists it (bearer secret) to the store. Null when a logout or a later sign-in discarded it.
   */
  static async completeAuthFromCallback(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult | null> {
    this.sessionEpoch++;
    const isCurrent = this.captureSessionOwner();
    const result = await LocksApplication.exchangeSessionCode(params);
    // TODO:[Locks] #2283 — for now the Locks account must be the signed-in pubky.app account (a == b).
    // The final plan allows a different account (a != b); remove this check then.
    const creator = stripPubkyPrefix(result.session.creatorPubky() ?? '');
    if (!isCurrent() || creator !== useAuthStore.getState().currentUserPubky) {
      // The secret is dropped here, so close the session now instead of leaving it open until it expires.
      void LocksApplication.signout(result.session).catch(() => {});
      if (!isCurrent()) return null;
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'Approve with the account you are signed in with.', {
        service: ErrorService.Locks,
        operation: 'LocksController.completeAuthFromCallback',
      });
    }
    // Also invalidate requests that began on the old session while this exchange was in flight.
    this.sessionEpoch++;
    useLocksAuthStore.getState().init({ session: result.session, secret: result.secret, creatorPubky: creator });
    // Register the creator's default Lock Server pointer in the background on every auth, mirroring
    // the homeserver's post-auth write. Fire-and-forget: a failure (already reported to Sentry by the
    // service Err factory) must not drop the established session — the write is idempotent and
    // retried on the next auth. Runs after `init` — the service reads the session it just persisted.
    void LocksApplication.setLockServiceConfig().catch(() => {});
    return result;
  }

  /**
   * Tears down the Locks session as part of unified pubky.app logout: revokes the frontend session on
   * the Lock Server (best-effort) after detaching the local session. Invoked from `AuthController` cleanup so
   * one logout drops both the homeserver and Locks sessions.
   */
  static async logout(persist = true): Promise<void> {
    const { generation, currentUserPubky } = useAuthStore.getState();
    const store = useLocksAuthStore.getState();
    const session = store.selectLocksSession();
    const secret = store.selectLocksSessionSecret();
    // Detach before awaiting the server, so completion cannot erase a later login.
    this.clearLocalSession(persist);
    if (session || secret) {
      try {
        // A server that accepts the connection but never answers would otherwise hold logout for as
        // long as the OS takes to give up, leaving cookies and the local database in place.
        await Promise.race([this.revokeOnServer(session, secret), sleep(SIGNOUT_TIMEOUT_MS)]);
      } catch {
        // Already reported to Sentry by the service Err factory; swallow so local teardown runs.
      }
    }
    // Invalidate a Locks sign-in started during signout, but preserve a newer pubky.app login.
    const current = useAuthStore.getState();
    if (current.generation === generation && current.currentUserPubky === currentUserPubky) {
      this.clearLocalSession(persist);
    }
  }

  /**
   * Signs the session out on the Lock Server. On a fresh load the persisted secret is back before
   * `restorePersistedLocksSession` has rebuilt the live session, so a logout in that window rebuilds
   * it from the captured secret (offline) first: the SDK has no revoke-by-secret call (#2712).
   */
  private static async revokeOnServer(session: LocksSdkSession | null, secret: string | null): Promise<void> {
    const live = session ?? (secret ? await LocksApplication.restoreSession(secret) : null);
    if (live) await LocksApplication.signout(live);
  }

  /** Detach this tab without overwriting another account's shared secret. */
  static clearLocalSession(persist = false): void {
    this.sessionEpoch++;
    if (persist) {
      try {
        useLocksAuthStore.getState().reset();
        return;
      } catch {
        // Continue with an in-memory reset if localStorage is blocked.
      }
    }
    const { storage } = useLocksAuthStore.persist.getOptions();
    if (!storage) {
      useLocksAuthStore.getState().reset();
      return;
    }
    useLocksAuthStore.persist.setOptions({ storage: { ...storage, setItem: () => {}, removeItem: () => {} } });
    try {
      useLocksAuthStore.getState().reset();
    } finally {
      useLocksAuthStore.persist.setOptions({ storage });
    }
  }

  /**
   * Clears the Locks session locally. Does not call the Lock Server.
   *
   * Invalidates pending sign-ins too. Request failures must check their captured owner first,
   * so a late rejection of an old session cannot discard its replacement.
   */
  static clearSession(): void {
    this.clearLocalSession(true);
  }

  static markPaykitConnected(): void {
    useLocksAuthStore.getState().setPaykitConnected(true);
  }

  /**
   * Asks the Lock Server whether this creator's Paykit payout account is already set up. A rejected
   * session (401 → Auth) is cleared, as on restore, so the creator signs in again instead of retrying.
   */
  static async fetchPaykitSetupStatus(asset: TLockPriceAsset): Promise<TPaykitSetupStatus> {
    const isCurrentSession = this.captureSessionOwner();
    const session = useLocksAuthStore.getState().selectLocksSession();
    const generation = ++this.paykitSetupGeneration;
    const isCurrent = () => isCurrentSession() && useLocksAuthStore.getState().selectLocksSession() === session;
    try {
      const status = await LocksApplication.fetchPaykitSetupStatus(asset);
      if (!isCurrent()) return 'unavailable';
      if (generation === this.paykitSetupGeneration && status === 'setup_required') {
        useLocksAuthStore.getState().setPaykitConnected(false);
      }
      return status;
    } catch (error) {
      if (isCurrent() && generation === this.paykitSetupGeneration && isAppError(error) && isAuthError(error)) {
        this.clearSession();
      }
      throw error;
    }
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
    const { currentUserPubky } = useAuthStore.getState();
    const secret = store.selectLocksSessionSecret();
    if (!currentUserPubky || !secret || store.selectLocksSession() !== null) return;
    // TODO:[Locks] #2283 — a == b check. Change it together with the a == b check in `completeAuthFromCallback`.
    if (store.selectLocksCreatorPubky() !== currentUserPubky) {
      this.clearLocalSession();
      return;
    }
    const ownsAccount = this.captureSessionOwner();
    const isCurrent = () => ownsAccount() && useLocksAuthStore.getState().selectLocksSessionSecret() === secret;

    try {
      const session = await LocksApplication.restoreSession();
      if (!isCurrent()) return;
      store.setSession(session);
    } catch {
      // Malformed/stale secret — already reported by the service Err factory; clear it so the UI
      // shows unauthenticated rather than a broken session.
      if (isCurrent()) this.clearSession();
      return;
    }

    try {
      await LocksApplication.setLockServiceConfig();
    } catch (error) {
      if (isCurrent() && isAppError(error) && isAuthError(error)) this.clearSession();
    }
  }

  /**
   * Publishes one content lock from the composer's files. The upload/bundle workflow lives in
   * `LocksApplication.createLockContent`. A rejected session is cleared only if no logout or newer
   * sign-in has superseded the request; the caller still receives the original error.
   */
  static async createLockContent(params: TCreateLockContentParams): Promise<TCreateContentLockResult> {
    const isCurrent = this.captureSessionOwner();
    try {
      return await LocksApplication.createLockContent({ ...params, isCurrent: captureViewerSession() });
    } catch (error) {
      // A homeserver auth failure cannot be fixed by signing in to the Lock Server.
      if (isCurrent() && isAppError(error) && isAuthError(error) && error.service === ErrorService.Locks) {
        this.clearSession();
      }
      throw error;
    }
  }

  /**
   * Deletes the lock behind an announcement. Same session-owner rule as `createLockContent`: a
   * rejected session is cleared only while this request still owns it.
   */
  static async deleteLockContent(params: TDeleteLockContentParams): Promise<void> {
    const isCurrent = this.captureSessionOwner();
    // With no session there is nothing to invalidate; clearing would also drop the stored secret a
    // restore still in flight is about to use.
    const hadSession = useLocksAuthStore.getState().selectLocksSession() !== null;
    try {
      await LocksApplication.deleteLockContent({ ...params, isCurrent: captureViewerSession() });
    } catch (error) {
      if (
        hadSession &&
        isCurrent() &&
        isAppError(error) &&
        isAuthError(error) &&
        error.service === ErrorService.Locks
      ) {
        this.clearSession();
      }
      throw error;
    }
  }

  /**
   * Fetch the lock file (`lock.json`) referenced by a post's top-level `lock` URL and resolve how
   * its content is gated. Delegates to the application, which validates the URL and performs the read.
   */
  static async fetchLockFile(params: TFetchLockFileParams): Promise<TFetchLockFileResult> {
    const lockFile = await LocksApplication.fetchLockFile({ ...params, isCurrent: captureViewerSession() });
    return {
      lockFile,
      price: LockFileParser.resolvePrice(lockFile),
    };
  }

  static async getOrFetchLockFile(params: TFetchLockFileParams): Promise<TFetchLockFileResult> {
    const lockFile = await LocksApplication.getOrFetchLockFile({ ...params, isCurrent: captureViewerSession() });
    return {
      lockFile,
      price: LockFileParser.resolvePrice(lockFile),
    };
  }

  static getUnlockedPost(params: TFetchLockFileParams): Promise<ReplicatedPost | null> {
    return LocksApplication.getUnlockedPost(params);
  }

  static getOwnPost(params: TFetchLockFileParams): Promise<ReplicatedPost | null> {
    return LocksApplication.getOwnPost(params);
  }

  static getUnlockedList(): Promise<TUnlockedListItem[]> {
    return LocksApplication.getUnlockedList();
  }

  /** Announcement content of a lock post; null when the post's `content` isn't valid announcement JSON. */
  static getLockContent(content: string): LockPostContent | null {
    return LockContentParser.parse(content);
  }

  /** Whether the reader's wallet has published a Paykit receiver. */
  static hasPaykitReceiver(readerPubky: string): Promise<boolean> {
    return LocksApplication.hasPaykitReceiver(readerPubky);
  }

  /** The saved bundle id to continue this lock's payment with, by the server's view of each; null when none is saved. */
  static fetchResolvedPurchase(params: TPaymentLockParams): Promise<TResolvedPurchase | null> {
    return LocksApplication.fetchResolvedPurchase(params);
  }

  /**
   * Reuses or saves a bundle id on the reader's homeserver and submits the payment proof to the Lock Server;
   * an automatic start that finds every saved id ended only reports that status.
   */
  static startPayment(params: TStartPaymentParams): Promise<TStartPaymentResult> {
    return LocksApplication.startPayment(params);
  }

  /** One read of the Paykit link for a submitted payment. Needs the task the submission created. */
  static fetchPaykitConnectionState(params: TPaymentBundleParams): Promise<TPaykitConnectionState> {
    return LocksApplication.fetchPaykitConnectionState(params);
  }

  /** One read of the payment's verification task, or null when the submission never reached the server. */
  static fetchPaymentStatus(params: TPaymentBundleParams): Promise<TVerificationTask | null> {
    return LocksApplication.fetchPaymentStatus(params);
  }

  /** Lock ids the reader has started a payment for (pending and failed included) — one listing serves every lock post on screen. */
  static fetchPurchasedLockIds(params: TFetchUnlockedListParams): Promise<string[]> {
    return LocksApplication.fetchPurchasedLockIds(params);
  }

  /** Gets an access credential for a paid bundle id from the Lock Server, then downloads the post + attachments with it. */
  static fetchPaidContent(params: TPaymentBundleParams): Promise<TUnlockedContent> {
    return LocksApplication.fetchPaidContent(params);
  }

  /** Copies unlocked content into the reader's own `/priv`, so later reads need no credential. */
  static replicateUnlockedContent({
    postId,
    ...params
  }: Omit<TReplicateUnlockedContentParams, 'announcementUri'> & { postId: string }): Promise<void> {
    const { pubky: authorId, id: rawPostId } = parseCompositeId(postId);
    return LocksApplication.replicateUnlockedContent({
      ...params,
      announcementUri: postUriBuilder(authorId, rawPostId),
      isCurrent: captureViewerSession(),
    });
  }

  /** Loads already-unlocked content from the reader's `/priv`, or null if this lock isn't unlocked yet. */
  static fetchReplicatedContent(params: TFetchReplicatedContentParams): Promise<TUnlockedContent | null> {
    return LocksApplication.fetchReplicatedContent({ ...params, isCurrent: captureViewerSession() });
  }

  /** Loads the media bytes for one already-listed unlocked post. */
  static fetchReplicatedAttachments(params: TFetchReplicatedAttachmentsParams): Promise<TUnlockedAttachment[]> {
    return LocksApplication.fetchReplicatedAttachments(params);
  }

  /** Lists the reader's unlocked content (newest first) from their own `/priv/social/unlocked/`. */
  static fetchUnlockedList(params: TFetchUnlockedListParams): Promise<TUnlockedListItem[]> {
    return LocksApplication.fetchUnlockedList({ ...params, isCurrent: captureViewerSession() });
  }

  /** Creator reads their own locked content directly from the guarded original (owner == signed-in). */
  static fetchOwnContent(params: TFetchOwnContentParams): Promise<TUnlockedContent> {
    return LocksApplication.fetchOwnContent({ ...params, isCurrent: captureViewerSession() });
  }
}
