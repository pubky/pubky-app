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
import { getHomeserver, getLockServer, getPkarrRelays, getTestnet } from '@/config/network';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
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

  /** One-time wasm init promise; see `ensureLocksSdkReady`. */
  private static sdkReady: Promise<void> | null = null;

  /**
   * Runs the locks-sdk's wasm `init()` (its default export) once, on the first call. The `pkg`
   * build of the SDK (wasm-pack `--target web`) requires this before any SDK class is used —
   * unlike `@synonymdev/pubky` / `pubky-app-specs`, which self-initialize on import.
   *
   * TODO: This only exists because the SDK is shipped as the web build. If the SDK is published
   * as a bundler or self-contained (base64-inlined) build instead, wasm initializes on import and
   * this method becomes unnecessary — the app would just `import` the SDK like the other wasm
   * deps. Prefer that; ask the SDK maintainers to ship it self-contained. Reference for the
   * self-contained approach (pubky-app-specs #60):
   * https://github.com/pubky/pubky-app-specs/pull/60/changes#diff-028ca4d711c47ae908581ec9a46af068ac895940de4c76e845234e61bc06b3d7
   */
  private static ensureLocksSdkReady(): Promise<void> {
    if (!this.sdkReady) {
      this.sdkReady = import('@pubky/locks-sdk').then(async ({ default: init }) => {
        await init();
      });
    }
    return this.sdkReady;
  }

  /**
   * The runtime-configured Lock Server pubky. Locks is a feature that can simply be off (no config),
   * and every Locks entry point is gated on the config, so this never fires in a healthy build —
   * a warning is enough; no typed error, no Sentry noise for a disabled feature.
   */
  private static requireLockServer(): string {
    const lockServerPubky = getLockServer();
    if (!lockServerPubky) {
      Logger.warn('[LocksService] No Lock Server configured (Locks disabled); call should be unreachable');
      throw new Error('No Lock Server configured');
    }
    return lockServerPubky;
  }

  /**
   * The live Locks session, read from the store (ADR 0004 exception, see the class doc).
   *
   * The composer UI checks the session only once — at the moment the lock switch is flipped. The
   * session can disappear between that check and the actual publish (e.g. logging out in another
   * tab while the Lock Content dialog is still open), so that early check cannot be trusted here.
   * Always re-read the store at call time; a missing session becomes a typed auth error the UI
   * answers by reopening sign-in.
   */
  private static requireSession(): LocksSdkSession {
    const session = useLocksAuthStore.getState().selectLocksSession();
    if (!session) {
      throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'No Locks session; sign into the Lock Server first', {
        service: ErrorService.Locks,
        operation: 'LocksService.requireSession',
      });
    }
    return session;
  }

  /**
   * Awaits the one-time wasm init and returns the Locks client bound to the runtime-configured
   * Lock Server (built once from the app's network config, then reused).
   */
  private static async getLocksClient(): Promise<Locks> {
    await this.ensureLocksSdkReady();
    if (!this.locksClient) {
      const options = new LocksOptions();
      for (const relay of getPkarrRelays()) {
        options.addPkarrRelay(relay);
      }
      if (getTestnet()) {
        options.setLocalTestnetHomeserver(getHomeserver());
      }
      this.locksClient = Locks.forServerWithOptions(this.requireLockServer(), options);
    }
    return this.locksClient;
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
    const session = this.requireSession();
    try {
      await session.signout();
    } catch (error) {
      throw toAppError(error, ErrorService.Locks, 'LocksService.signout');
    }
  }

  /**
   * Registers the creator's default Lock Server (the runtime-configured one) by writing the
   * lock-service pointer (`/pub/locks.app/config.json`). The Lock Server performs the homeserver
   * write; the SDK session carries the frontend-session bearer, so the FE attaches no
   * `Authorization` header by hand.
   */
  static async setLockServiceConfig(): Promise<void> {
    const session = this.requireSession();
    try {
      await this.ensureLocksSdkReady();
      await session.creator.setLockServicePointer(new SetLockServicePointerOptions(this.requireLockServer()));
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
    path,
    contentType,
    bytes,
  }: TRegisterGuardedResourceParams): Promise<TRegisterGuardedResourceResult> {
    const session = this.requireSession();
    try {
      await this.ensureLocksSdkReady();
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
    const session = this.requireSession();
    try {
      await this.ensureLocksSdkReady();
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
