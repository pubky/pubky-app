import {
  ConnectUrlOptions,
  CreateContentLockRequestBuilder,
  ExchangeFrontendSessionCodeOptions,
  Locks,
  RegisterGuardedResourceOptions,
  type Session as LocksSdkSession,
  SetLockServicePointerOptions,
} from '@pubky/locks-sdk';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import type {
  TCreateContentLockParams,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TGenerateConnectUrlParams,
  TGuardedResource,
  TLocksSessionResult,
  TRegisterGuardedResourceParams,
  TRegisterGuardedResourceResult,
} from './locks.types';
import { ensureLocksSdkReady, getLockServerPubky, getLockSession, initLockClient, toLocksError } from './locks.utils';

/** Opt-in flag telling the Lock Server `/connect` shell to deliver the code via postMessage
 * instead of redirecting back to `returnTo`. */
const DELIVERY_POSTMESSAGE = 'postmessage';

/**
 * IO boundary for the Lock Server via the locks-sdk. Client building, session/config reads, wasm
 * init, and error mapping live in `locks.utils.ts`; this class composes them into the app's calls.
 *
 * Auth methods open sessions, so they build a Locks client from runtime config (Lock Server pubky,
 * pkarr relays / testnet homeserver — like `HomeserverService`). Content methods publish locked
 * content through the live session, so they need no client — two calls compose one lock:
 * N × `registerGuardedResource` (raw bytes per file) then 1 × `createContentLock` (bundles the
 * returned descriptors + unlock rules).
 *
 * Like `HomeserverService`, this service reads the session (and its persisted secret) straight from
 * `useLocksAuthStore` instead of receiving it as a param — the documented ADR 0004 store exception.
 * Reads only; every store write stays in the controller.
 */
export class LocksService {
  private constructor() {} // Prevent instantiation

  /** Cached SDK client (singleton, like `HomeserverService.getPubkySdk`); runtime config never changes. */
  private static locksClient: Locks | null = null;

  /**
   * Awaits the one-time wasm init and returns the Locks client bound to the runtime-configured
   * Lock Server (built once from the app's network config, then reused).
   */
  private static async getLocksClient(): Promise<Locks> {
    await ensureLocksSdkReady();
    if (!this.locksClient) {
      this.locksClient = initLockClient();
    }
    return this.locksClient;
  }

  /**
   * True when the Lock Server's `/readyz` returns 2xx. Gates the auth flow before the iframe loads,
   * so a down (throws) / not-ready (503) server is a boolean branch, not a logged error. No SDK
   * health surface, so it fetches `<origin>/readyz` directly (`origin` from the connect URL).
   */
  static async isServerReady(origin: string): Promise<boolean> {
    try {
      const response = await fetch(`${origin}/readyz`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Builds the Lock-Server-hosted `/connect` URL (resolves the server via pkarr) and opts into
   * postMessage delivery so the shell posts the code to the parent instead of redirecting.
   */
  static async generateConnectUrl({ returnTo, state }: TGenerateConnectUrlParams): Promise<string> {
    try {
      const locks = await this.getLocksClient();
      const url = await locks.createConnectUrl(new ConnectUrlOptions(returnTo, state));
      const withDelivery = new URL(url);
      withDelivery.searchParams.set('delivery', DELIVERY_POSTMESSAGE);
      return withDelivery.toString();
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.generateConnectUrl');
    }
  }

  /** Exchanges the one-time callback code for a Locks session. */
  static async exchangeSessionCode({ code, state }: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    try {
      const locks = await this.getLocksClient();
      const session = await locks.exchangeFrontendSessionCode(new ExchangeFrontendSessionCodeOptions(code, state));
      // secret is freshly minted here — export it so the caller can persist it.
      return { session, secret: session.exportSecret() };
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.exchangeSessionCode');
    }
  }

  /** Restores a Locks session from the persisted bearer secret (read from the store). */
  static async restoreSession(): Promise<LocksSdkSession> {
    const secret = useLocksAuthStore.getState().selectLocksSessionSecret();
    if (!secret) {
      throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'No persisted Locks secret to restore', {
        service: ErrorService.Locks,
        operation: 'LocksService.restoreSession',
      });
    }
    try {
      return (await this.getLocksClient()).restoreSession(secret);
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.restoreSession');
    }
  }

  /** Signs the Locks session out on the Lock Server. */
  static async signout(): Promise<void> {
    const session = getLockSession();
    try {
      await session.signout();
    } catch (error) {
      throw toLocksError(error, 'LocksService.signout');
    }
  }

  /**
   * Registers the creator's default Lock Server (the runtime-configured one) by writing the
   * lock-service pointer (`/pub/locks.app/config.json`). The Lock Server performs the homeserver
   * write; the SDK session carries the frontend-session bearer, so the FE attaches no
   * `Authorization` header by hand.
   */
  static async setLockServiceConfig(): Promise<void> {
    const session = getLockSession();
    try {
      await ensureLocksSdkReady();
      await session.creator.setLockServicePointer(new SetLockServicePointerOptions(getLockServerPubky()));
    } catch (error) {
      throw toLocksError(error, 'LocksService.setLockServiceConfig');
    }
  }

  /**
   * Uploads one file's raw bytes under `/priv/locks.app/content/<path>` and returns its descriptor
   * ({ path, hash, content_type, size }) plus the owner pubky — the Lock-Server-authenticated account
   * the bytes landed on, which the post needs to reference its attachments by the right host.
   * Re-uploading the same path silently overwrites — the caller mints a fresh path per file so
   * nothing is ever clobbered.
   */
  static async registerGuardedResource({
    path,
    contentType,
    bytes,
  }: TRegisterGuardedResourceParams): Promise<TRegisterGuardedResourceResult> {
    const session = getLockSession();
    try {
      await ensureLocksSdkReady();
      // TODO:[Locks] #2040 — same untyped-SDK cast as `createContentLock` below.
      const response = (await session.creator.registerGuardedResource(
        new RegisterGuardedResourceOptions(path, contentType, bytes),
      )) as { creator: string; guarded_resource: TGuardedResource };
      return { resource: response.guarded_resource, creator: response.creator };
    } catch (error) {
      throw toLocksError(error, 'LocksService.registerGuardedResource');
    }
  }

  /**
   * Bundles already-uploaded resources into one content lock and returns the lock descriptor
   * (`lock_id`, `content_lock_path`). Validated all-or-nothing: every referenced
   * resource must exist with a matching hash, and size/count limits are enforced here (not at upload).
   *
   * TODO:[Locks] #2039 — orphan cleanup. A failure here leaves the resources uploaded by the
   * preceding `registerGuardedResource` calls on the server, unreferenced.
   * Scenario: 3 of 4 files upload, then this rejects (size/count limit, hash mismatch, malformed
   * body) and the 3 blobs linger under `/priv/locks.app/content/`. Harmless — each path is minted
   * fresh, so no existing lock breaks — but it wastes the creator's private storage. Closing the tab
   * between the two calls has the same effect and no `catch` can cover it.
   * When #2039 lands: best-effort `deleteGuardedResource` per path on a deterministic 4xx or a user
   * cancel. Transient failures (network / 5xx / 401) must retry this call instead of deleting: the
   * uploaded resources are still valid and their hashes unchanged.
   */
  static async createContentLock({
    primaryResource,
    secondaryResources = [],
    criteria,
    lockLogic,
    accessPolicy,
  }: TCreateContentLockParams): Promise<TCreateContentLockResult> {
    const session = getLockSession();
    try {
      await ensureLocksSdkReady();
      // primaryResource is the JSON file holding the `PubkyAppPost` object (the lock's entry point).
      let builder = new CreateContentLockRequestBuilder().primaryResource(primaryResource);
      for (const resource of secondaryResources) {
        builder = builder.secondaryResource(resource);
      }
      const body = builder
        .criteria(criteria)
        .lockLogic(lockLogic)
        .accessPolicy(accessPolicy)
        // Pin the lock to the session's Lock Server — the only one holding the bytes we just uploaded.
        // Leaving this null would defer to the creator's default pointer, which can later change.
        .lockServer({ override: session.lockServer() })
        .build();

      // TODO:[Locks] #2040 — the SDK declares `Promise<any>` (wasm-bindgen cannot type JSON), so the
      // response shape is asserted here. Delete the cast when the SDK exports typed responses.
      const response = (await session.creator.createContentLock(body)) as {
        lock_id: string;
        content_lock_path: string;
        content_lock: { creator: string };
      };
      return {
        lock_id: response.lock_id,
        content_lock_path: response.content_lock_path,
        creator: response.content_lock.creator,
      };
    } catch (error) {
      throw toLocksError(error, 'LocksService.createContentLock');
    }
  }
}
