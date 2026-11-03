import type {
  ConnectUrlOptions,
  Creator,
  ExchangeFrontendSessionCodeOptions,
  Locks,
  RegisterGuardedResourceOptions,
  Session,
  VerificationTaskHandleOptions,
  Viewer,
} from '@synonymdev/locks-sdk';
import { LOCKS_GUARDED_CONTENT_PATH } from '@/config/locks';
import { getLockServer } from '@/config/network';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { stripPubkyPrefix, withPubkyPrefix } from '@/libs/utils/utils';
import { HomeserverService } from '@/services/homeserver/homeserver';

/**
 * Cypress E2E stand-in for the Locks SDK client, active only when `PUBKY_RUNTIME_E2E_LOCKS_STUB_URL`
 * is set (the Locks spec's CI job; never a deploy). The real Lock Server, Paykit and Bitkit cannot
 * run in CI, so every call the SDK would send to the Lock Server goes to `<stub>/e2e/...` instead,
 * where the spec answers it with `cy.intercept`.
 *
 * The homeserver stays real: the writes the Lock Server makes on the creator's behalf (guarded bytes
 * under `/priv/app.locks/content/`, the public `lock.json`) are made here through
 * `HomeserverService` with the creator's own session, so the owner view and every reader-side
 * `/priv` read and replica write hit the real homeserver.
 *
 * Errors keep the SDK's `Lock Server request failed with HTTP <status>` message, which
 * `toLocksError` and `LocksService.lookupVerificationTask` read.
 */

const SECRET_PREFIX = 'e2e-locks:';

/** The two SDK statics `LocksService` reads through; see `getLocksReads`. */
export type TLocksReads = {
  readContentLock: (resource: string) => Promise<unknown>;
  hasPaykitData: (user: string) => Promise<boolean>;
};

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/** `text/plain` keeps each call a CORS simple request, so the stub never has to answer a preflight. */
async function post<T>(stubUrl: string, path: string, body: unknown, operation: string): Promise<T> {
  const response = await fetch(new URL(`/e2e/${path}`, stubUrl), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw Err.server(ServerErrorCode.INTERNAL_ERROR, `Lock Server request failed with HTTP ${response.status}`, {
      service: ErrorService.Locks,
      operation,
      context: { path, statusCode: response.status },
    });
  }
  return (await response.json()) as T;
}

const handle = (options: VerificationTaskHandleOptions) => ({
  creator: options.creator,
  bundle_id: options.bundleId,
});

function createCreator(stubUrl: string, owner: string): Creator {
  const creator: Pick<
    Creator,
    'setLockServicePointer' | 'paykitSetupStatus' | 'registerGuardedResource' | 'createContentLock'
  > = {
    setLockServicePointer: async (options) => {
      await post(
        stubUrl,
        'creator/lock-service-pointer',
        { owner, default_lock_server: options.defaultLockServer },
        'setLockServicePointer',
      );
    },
    paykitSetupStatus: (asset) => post(stubUrl, 'creator/paykit-setup-status', { owner, asset }, 'paykitSetupStatus'),
    registerGuardedResource: async (options: RegisterGuardedResourceOptions) => {
      const bytes = options.bytes;
      await HomeserverService.putBlob({
        url: `pubky://${owner}${LOCKS_GUARDED_CONTENT_PATH}${options.path}`,
        blob: bytes,
      });
      return post(
        stubUrl,
        'creator/guarded-resources',
        { owner, path: options.path, content_type: options.contentType, bytes: toBase64(bytes) },
        'registerGuardedResource',
      );
    },
    createContentLock: async (body) => {
      const response = await post<{ content_lock_path: string; content_lock: unknown }>(
        stubUrl,
        'creator/content-locks',
        { owner, body },
        'createContentLock',
      );
      await HomeserverService.putBlob({
        url: `pubky://${owner}${response.content_lock_path}`,
        blob: new TextEncoder().encode(JSON.stringify(response.content_lock)),
      });
      return response;
    },
  };
  return creator as Creator;
}

function createSession(stubUrl: string, owner: string): Session {
  const session: Pick<Session, 'creatorPubky' | 'exportSecret' | 'lockServer' | 'signout' | 'creator'> = {
    creatorPubky: () => withPubkyPrefix(owner),
    exportSecret: () => `${SECRET_PREFIX}${owner}`,
    lockServer: () => getLockServer() ?? '',
    signout: async () => {},
    creator: createCreator(stubUrl, owner),
  };
  return session as Session;
}

function createViewer(stubUrl: string): Viewer {
  const viewer: Pick<
    Viewer,
    | 'submitProofBundle'
    | 'lookupVerificationTask'
    | 'lookupPaykitConnectionState'
    | 'issueAccessCredential'
    | 'proxyReadGuardedResource'
  > = {
    submitProofBundle: (bundle) => post(stubUrl, 'viewer/proof-bundles', bundle, 'submitProofBundle'),
    lookupVerificationTask: (options) =>
      post(stubUrl, 'viewer/verification-tasks', handle(options), 'lookupVerificationTask'),
    lookupPaykitConnectionState: (options) =>
      post(stubUrl, 'viewer/paykit-connection-state', handle(options), 'lookupPaykitConnectionState'),
    issueAccessCredential: (options) =>
      post(stubUrl, 'viewer/access-credentials', handle(options), 'issueAccessCredential'),
    proxyReadGuardedResource: async (credential, path) => {
      const { bytes } = await post<{ bytes: string }>(
        stubUrl,
        'viewer/guarded-resources/read',
        { credential, path },
        'proxyReadGuardedResource',
      );
      return fromBase64(bytes);
    },
  };
  return viewer as Viewer;
}

/** The `Locks` client: connect URL, code exchange, session restore and the reader `Viewer`. */
export function createE2eLocksClient(stubUrl: string): Locks {
  const viewer = createViewer(stubUrl);
  const client: Pick<Locks, 'createConnectUrl' | 'exchangeFrontendSessionCode' | 'restoreSession' | 'viewer'> = {
    createConnectUrl: async (options: ConnectUrlOptions) => {
      const url = new URL('/connect', stubUrl);
      url.searchParams.set('return_to', options.returnTo);
      url.searchParams.set('state', options.state);
      return url.toString();
    },
    exchangeFrontendSessionCode: async (options: ExchangeFrontendSessionCodeOptions) => {
      const { creator } = await post<{ creator: string }>(
        stubUrl,
        'session/exchange',
        { code: options.code, state: options.state },
        'exchangeFrontendSessionCode',
      );
      return createSession(stubUrl, stripPubkyPrefix(creator));
    },
    restoreSession: (secret: string) => {
      if (!secret.startsWith(SECRET_PREFIX)) {
        throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Not an E2E Locks session secret', {
          service: ErrorService.Locks,
          operation: 'restoreSession',
        });
      }
      return createSession(stubUrl, secret.slice(SECRET_PREFIX.length));
    },
    viewer,
  };
  return client as Locks;
}

/**
 * The SDK's static reads. The lock file is read from the creator's real homeserver, where
 * `createContentLock` above published it; the reader's Paykit presence comes from the stub.
 */
export function createE2eLocksReads(stubUrl: string): TLocksReads {
  return {
    readContentLock: async (resource) =>
      JSON.parse(new TextDecoder().decode(await HomeserverService.getBytes(`pubky://${resource}`))),
    hasPaykitData: async (user) => {
      const { has_data } = await post<{ has_data: boolean }>(stubUrl, 'paykit/has-data', { user }, 'hasPaykitData');
      return has_data;
    },
  };
}
