import {
  ConnectUrlOptions,
  CreateContentLockRequestBuilder,
  ExchangeFrontendSessionCodeOptions,
  Locks,
  LocksOptions,
  RegisterGuardedResourceOptions,
  type Session as LocksSdkSession,
  SetLockServicePointerOptions,
} from '@pubky/locks-sdk';
import { getHomeserver, getPkarrRelays, getTestnet } from '@/config/network';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { ensureLocksSdkReady } from '@/libs/locks/locksSdk';
import type {
  TCreateContentLockParams,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TGenerateConnectUrlParams,
  TGuardedResource,
  TLocksSessionResult,
  TRegisterGuardedResourceParams,
  TRegisterGuardedResourceResult,
  TRestoreLocksSessionParams,
} from './locks.types';

/** Opt-in flag telling the Lock Server `/connect` shell to deliver the code via postMessage
 * instead of redirecting back to `returnTo`. */
const DELIVERY_POSTMESSAGE = 'postmessage';

/**
 * The SDK reports HTTP failures as `Lock Server request failed with HTTP <status>` and exposes no
 * status field, so the string is the only signal. Parse it here, at the IO boundary, and promote a
 * rejected session to a typed auth error the UI can act on (`category === Auth` → re-authenticate).
 */
function toLocksError(error: unknown, operation: string) {
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

/**
 * IO boundary for the Lock Server via the locks-sdk.
 *
 * Auth methods open sessions, so they build a Locks client from the app's network config
 * (pkarr relays / testnet homeserver, like `HomeserverService`). Content methods publish locked
 * content through a live `session` (bound to its Lock Server), so they need no network config —
 * two calls compose one lock: N × `registerGuardedResource` (raw bytes per file) then
 * 1 × `createContentLock` (bundles the returned descriptors + unlock rules).
 */
export class LocksService {
  private constructor() {} // Prevent instantiation

  /** Builds a Locks client bound to the given Lock Server, using the app's network config. */
  private static buildLocksClient(lockServerPubky: string): Locks {
    const options = new LocksOptions();
    for (const relay of getPkarrRelays()) {
      options.addPkarrRelay(relay);
    }
    if (getTestnet()) {
      options.setLocalTestnetHomeserver(getHomeserver());
    }
    return Locks.forServerWithOptions(lockServerPubky, options);
  }

  /**
   * Builds the Lock-Server-hosted `/connect` URL (resolves the server via pkarr) and opts into
   * postMessage delivery so the shell posts the code to the parent instead of redirecting.
   */
  static async generateConnectUrl({ lockServerPubky, returnTo, state }: TGenerateConnectUrlParams): Promise<string> {
    try {
      await ensureLocksSdkReady();
      const locks = this.buildLocksClient(lockServerPubky);
      const url = await locks.createConnectUrl(new ConnectUrlOptions(returnTo, state));
      const withDelivery = new URL(url);
      withDelivery.searchParams.set('delivery', DELIVERY_POSTMESSAGE);
      return withDelivery.toString();
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.generateConnectUrl');
    }
  }

  /** Exchanges the one-time callback code for a Locks session. */
  static async exchangeSessionCode({
    lockServerPubky,
    code,
    state,
  }: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    try {
      await ensureLocksSdkReady();
      const locks = this.buildLocksClient(lockServerPubky);
      const session = await locks.exchangeFrontendSessionCode(new ExchangeFrontendSessionCodeOptions(code, state));
      // secret is freshly minted here — export it so the caller can persist it.
      return { session, secret: session.exportSecret() };
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.exchangeSessionCode');
    }
  }

  /** Restores a Locks session from a persisted bearer secret. */
  static async restoreSession({ lockServerPubky, secret }: TRestoreLocksSessionParams): Promise<LocksSdkSession> {
    try {
      await ensureLocksSdkReady();
      return this.buildLocksClient(lockServerPubky).restoreSession(secret);
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.restoreSession');
    }
  }

  /** Signs the Locks session out on the Lock Server. */
  static async signout(session: LocksSdkSession): Promise<void> {
    try {
      await session.signout();
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.signout');
    }
  }

  /**
   * Registers the creator's default Lock Server by writing the lock-service pointer
   * (`/pub/locks.app/config.json`). The Lock Server performs the homeserver write; the SDK session
   * carries the frontend-session bearer, so the FE attaches no `Authorization` header by hand.
   */
  static async setLockServiceConfig(session: LocksSdkSession, defaultLockServer: string): Promise<void> {
    try {
      await ensureLocksSdkReady();
      await session.creator.setLockServicePointer(new SetLockServicePointerOptions(defaultLockServer));
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.setLockServiceConfig');
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
    session,
    path,
    contentType,
    bytes,
  }: TRegisterGuardedResourceParams): Promise<TRegisterGuardedResourceResult> {
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
    session,
    primaryResource,
    secondaryResources = [],
    criteria,
    lockLogic,
    accessPolicy,
    lockServer,
  }: TCreateContentLockParams): Promise<TCreateContentLockResult> {
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
        .lockServer(lockServer)
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
