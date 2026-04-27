import * as Core from '@/core';
import * as Config from '@/config';
import {
  Pubky,
  PublicKey,
  Keypair,
  Capabilities,
  Signer,
  Address,
  resolvePubky,
  AuthFlowKind,
  Session,
  Client,
} from '@synonymdev/pubky';
import {
  isHttpUrl,
  parseResponseOrUndefined,
  createCancelableAuthApproval,
  resolveOwnedSessionPath,
  assertOk,
  getOwnedResponse,
  PUBKY_PREFIX,
} from './homeserver.utils';
import { handleError } from './error.utils';

import type {
  PubPath,
  TOwnedSessionPath,
  TGenerateSignupAuthUrlParams,
  THomeserverFetchParams,
  THomeserverRequestParams,
  TPutBlobParams,
  THomeserverListParams,
} from './homeserver.types';
import { Env } from '@/libs/env/env';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';

const TESTNET = Config.TESTNET.toString() === 'true';

const CAPABILITIES = '/pub/pubky.app/:rw';
const PUB_PATH_PREFIX = '/pub/' as const;
/** Default limit for list operations */
const LIST_DEFAULT_LIMIT = 500;

export class HomeserverService {
  private constructor() {}

  private static pubkySdk: Pubky | null = null;

  /**
   * Gets the Pubky SDK singleton.
   */
  private static getPubkySdk(): Pubky {
    if (!this.pubkySdk) {
      if (TESTNET) {
        this.pubkySdk = Pubky.testnet();
      } else {
        const client = new Client({ pkarr: { relays: Config.PKARR_RELAYS } });
        this.pubkySdk = Pubky.withClient(client);
      }
    }
    return this.pubkySdk;
  }

  private static resolveOwnedSessionPath(url: string): TOwnedSessionPath | null {
    const session = Core.useAuthStore.getState().selectSession();
    return resolveOwnedSessionPath({ url, session, pubPathPrefix: PUB_PATH_PREFIX });
  }

  /**
   * Gets a signer for the homeserver
   * @param keypair - The keypair to get a signer for
   * @returns The signer
   */
  private static getSigner(keypair: Keypair): Signer {
    const pubkySdk = this.getPubkySdk();
    return pubkySdk.signer(keypair);
  }

  /**
   * Checks if the keypair has a homeserver
   * @param publicKey - The public key to check
   * @returns The homeserver
   */
  private static async checkHomeserver({ publicKey }: Core.TPublicKeyParams) {
    try {
      const pubkySdk = this.getPubkySdk();
      const homeserver = await pubkySdk.getHomeserverOf(publicKey);

      if (!homeserver) {
        throw Error('Homeserver not found');
      }
      return homeserver;
    } catch (error) {
      return handleError({
        error,
        additionalContext: { publicKey: publicKey?.z32?.() },
      });
    }
  }

  /**
   * Signs up a new user in the homeserver
   * @param keypair - The keypair to sign up with
   * @param signupToken - The signup token to use
   * @returns The session
   */
  static async signUp({ keypair, signupToken }: Core.THomeserverSignUpParams): Promise<Core.THomeserverSessionResult> {
    try {
      const homeserverPublicKey = PublicKey.from(Config.HOMESERVER);
      const signer = this.getSigner(keypair);
      const session = await signer.signup(homeserverPublicKey, signupToken);

      Logger.debug('Signup successful', { session });

      return { session };
    } catch (error) {
      return handleError({
        error,
        additionalContext: { signupTokenProvided: Boolean(signupToken) },
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        alwaysUseHomeserverError: true,
      });
    }
  }

  /**
   * Signs in a user to the homeserver.
   *
   * If signin fails due to missing homeserver records, this method will attempt to republish
   * the homeserver and return `undefined` to signal the caller should retry the signin.
   *
   * @param keypair - The keypair to sign in with
   * @returns The session result, or `undefined` if homeserver was republished and caller should retry
   */
  static async signIn({ keypair }: Core.TKeypairParams): Promise<Core.THomeserverSessionResult | undefined> {
    const signer = this.getSigner(keypair);
    try {
      // get homeserver from pkarr records
      await this.checkHomeserver({ publicKey: keypair.publicKey });
      const session = await signer.signin();
      return { session };
    } catch (signinError) {
      try {
        // Republish keypair's homeserver
        const homeserverPublicKey = PublicKey.from(Config.HOMESERVER);
        await signer.pkdns.publishHomeserverForce(homeserverPublicKey);
        Logger.debug('Republish homeserver successful', { keypair: Identity.pubkyFromKeypair(keypair) });
        // Return undefined to signal caller should retry signin after republish
        return undefined;
      } catch (republishError) {
        // Report the republish error since that's what actually failed
        return handleError({
          error: republishError,
          additionalContext: { pubky: Identity.pubkyFromKeypair(keypair), originalSigninError: String(signinError) },
          statusCode: HttpStatusCode.UNAUTHORIZED,
        });
      }
    }
  }

  /**
   * Generates an authentication URL for the homeserver
   * @param caps - The capabilities to use
   * @returns The authentication URL and approval promise
   */
  static async generateAuthUrl(caps?: Capabilities): Promise<Core.TGenerateAuthUrlResult> {
    const capabilities: Capabilities = caps || CAPABILITIES;

    try {
      const pubkySdk = this.getPubkySdk();
      const flow = pubkySdk.startAuthFlow(capabilities, AuthFlowKind.signin(), Config.DEFAULT_HTTP_RELAY);
      const approval = createCancelableAuthApproval(flow);

      return {
        authorizationUrl: flow.authorizationUrl,
        awaitApproval: approval.awaitApproval,
        cancelAuthFlow: approval.cancel,
      };
    } catch (error) {
      return handleError({ error, additionalContext: { capabilities, relay: Config.DEFAULT_HTTP_RELAY } });
    }
  }

  /**
   * Generates an authentication signup URL for the homeserver.
   *
   * Temporary hack to create a signup deeplink from the signin url still using the old pubky sdk.
   * The new sdk will handle the creation of the signup deeplink out of the box.
   * But until then, we need to use this hack.
   * @param inviteCode InviteCode to the homeserver
   * @param caps - The capabilities to use
   * @returns The authentication URL and approval promise
   */
  static async generateSignupAuthUrl({
    inviteCode,
    caps,
  }: TGenerateSignupAuthUrlParams): Promise<Core.TGenerateAuthUrlResult> {
    const res = await this.generateAuthUrl(caps);
    const url = URL.parse(res.authorizationUrl);
    if (!url) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid authorization URL format', {
        service: ErrorService.Homeserver,
        operation: 'generateSignupAuthUrl',
        context: { authorizationUrl: res.authorizationUrl },
      });
    }
    url.host = 'signup';
    url.pathname = '';
    url.searchParams.set('hs', Env.NEXT_PUBLIC_HOMESERVER);
    url.searchParams.set('st', inviteCode);
    res.authorizationUrl = url.toString();
    return res;
  }

  /**
   * Logs out a user from the homeserver
   * @param session - The authenticated Session to sign out
   * @returns Void
   */
  static async logout({ session }: Core.THomeserverSessionResult) {
    try {
      await session.signout();
    } catch (error) {
      return handleError({ error, additionalContext: { url: 'signout' } });
    }
  }

  private static async fetch({ url, options }: THomeserverFetchParams): Promise<Response> {
    try {
      const pubkySdk = this.getPubkySdk();
      const httpBridge = pubkySdk.client;
      // Resolve pubky identifiers to transport URLs before fetching
      const resolvedUrl = url.startsWith(PUBKY_PREFIX) ? resolvePubky(url) : url;
      const response = await httpBridge.fetch(resolvedUrl, {
        method: options?.method,
        body: options?.body as BodyInit | undefined,
        credentials: 'include',
      });

      Logger.debug('Response from homeserver', { response });

      return response;
    } catch (error) {
      return handleError({ error, additionalContext: { url, method: options?.method } });
    }
  }

  /**
   * Performs a request against the homeserver.
   *
   * Sends a JSON payload when provided and throws if the response is not OK.
   * Note: Under the hood this uses `fetch` with `credentials: 'include'`.
   *
   * @param {HttpMethod} method - HTTP method to use (e.g. PUT, POST, DELETE).
   * @param {string} url - Pubky URL.
   * @param {Record<string, unknown>} [bodyJson] - JSON body to serialize and send.
   */
  static async request<T>({ method, url, bodyJson }: THomeserverRequestParams): Promise<T> {
    const owned = this.resolveOwnedSessionPath(url);

    // Handle owned session paths
    if (owned) {
      const { session, path } = owned;

      switch (method) {
        case HttpMethod.GET: {
          const response = await getOwnedResponse({ session, path, url });
          return (await parseResponseOrUndefined<T>({ response })) as T;
        }
        case HttpMethod.PUT:
          await session.storage
            .putJson(path, bodyJson ?? {})
            .catch((error) => handleError({ error, additionalContext: { url, method } }));
          return undefined as T;
        case HttpMethod.DELETE:
          await session.storage
            .delete(path)
            .catch((error) => handleError({ error, additionalContext: { url, method } }));
          return undefined as T;
      }
    }

    // Non-owned: only GET allowed on non-HTTP URLs
    if (method !== HttpMethod.GET && !isHttpUrl(url)) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Authenticated writes must target an owned ${PUB_PATH_PREFIX}* path for the current session.`,
        {
          service: ErrorService.Homeserver,
          operation: 'request',
          context: { url, method, statusCode: HttpStatusCode.BAD_REQUEST },
        },
      );
    }

    // Handle public requests
    const pubkySdk = this.getPubkySdk();
    const fetchPromise =
      method === HttpMethod.GET
        ? isHttpUrl(url)
          ? pubkySdk.client.fetch(url)
          : pubkySdk.publicStorage.get(url as Address)
        : this.fetch({ url, options: { method, body: bodyJson ? JSON.stringify(bodyJson) : undefined } });

    const response = await fetchPromise.catch((error) => handleError({ error, additionalContext: { url, method } }));

    await assertOk({ response, url, operation: 'request' });

    return method === HttpMethod.GET ? ((await parseResponseOrUndefined<T>({ response })) as T) : (undefined as T);
  }

  /**
   * Uploads binary data to the homeserver using PUT.
   *
   * Intended for blob contents (e.g., avatars). Throws if the response is not OK.
   * Note: Uses `fetch` with `credentials: 'include'`.
   *
   * @param {string} url - Pubky URL.
   * @param {Uint8Array} blob - Raw bytes of the blob to upload.
   */
  static async putBlob({ url, blob }: TPutBlobParams) {
    const owned = this.resolveOwnedSessionPath(url);
    if (owned) {
      try {
        await owned.session.storage.putBytes(owned.path, blob);
        return;
      } catch (error) {
        return handleError({ error, additionalContext: { url, method: HttpMethod.PUT } });
      }
    }

    if (!isHttpUrl(url)) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Blob uploads must target an owned ${PUB_PATH_PREFIX}* path for the current session.`,
        {
          service: ErrorService.Homeserver,
          operation: 'putBlob',
          context: { url, statusCode: HttpStatusCode.BAD_REQUEST },
        },
      );
    }

    const response = await this.fetch({ url, options: { method: HttpMethod.PUT, body: blob } });
    await assertOk({ response, url, operation: 'putBlob' });
  }

  /**
   * Lists files in a directory from the homeserver.
   *
   * Supports pagination with cursor and optional filtering.
   *
   * @param {string} baseDirectory - Base directory path to list files from.
   * @param {string} [cursor] - Optional cursor for pagination.
   * @param {boolean} [reverse=false] - Whether to list in reverse order.
   * @param {number} [limit=500] - Maximum number of files to return.
   * @returns {Promise<string[]>} Array of file URLs.
   */
  static async list({
    baseDirectory,
    cursor,
    reverse = false,
    limit = LIST_DEFAULT_LIMIT,
  }: THomeserverListParams): Promise<string[]> {
    const pubkySdk = this.getPubkySdk();
    try {
      const owned = this.resolveOwnedSessionPath(baseDirectory);
      if (owned) {
        const dirPath = owned.path.endsWith('/') ? owned.path : (`${owned.path}/` as PubPath<string>);
        const files = await owned.session.storage.list(dirPath, cursor ?? null, reverse, limit, false);
        Logger.debug('List successful', { baseDirectory, filesCount: files.length });
        return files;
      }

      const files = await pubkySdk.publicStorage.list(baseDirectory as Address, cursor ?? null, reverse, limit, false);
      Logger.debug('List successful', { baseDirectory, filesCount: files.length });
      return files;
    } catch (error) {
      return handleError({ error, additionalContext: { url: baseDirectory, baseDirectory } });
    }
  }

  /**
   * Deletes a file from the homeserver.
   *
   * @param {string} url - Pubky URL of the file to delete.
   */
  static async delete(url: string) {
    await this.request({ method: HttpMethod.DELETE, url });
    Logger.debug('Delete successful', { url });
  }

  /**
   * Fetches a resource from the homeserver.
   *
   * @param {string} url - Pubky URL to fetch.
   * @returns {Promise<Response>} The fetch response.
   */
  static async get(url: string): Promise<Response> {
    const pubkySdk = this.getPubkySdk();
    try {
      if (isHttpUrl(url)) {
        return await pubkySdk.client.fetch(url);
      }

      const owned = this.resolveOwnedSessionPath(url);
      if (owned) {
        return await getOwnedResponse({ session: owned.session, path: owned.path, url });
      }

      return await pubkySdk.publicStorage.get(url as Address);
    } catch (error) {
      return handleError({ error, additionalContext: { url, method: HttpMethod.GET } });
    }
  }

  /**
   * Restore an authenticated Session from a previous `session.export()` snapshot.
   */
  static async restoreSession({ sessionExport }: Core.THomeserverRestoreSessionParams): Promise<Session> {
    try {
      const pubkySdk = this.getPubkySdk();
      return await pubkySdk.restoreSession(sessionExport);
    } catch (error) {
      return handleError({
        error,
        additionalContext: { sessionExport: Boolean(sessionExport) },
      });
    }
  }

  /**
   * Generates a signup token for dev/test environments.
   * Calls the server-side API route to keep admin credentials secure.
   *
   * @security Admin credentials are never exposed to the client.
   * The actual token generation happens server-side via /api/dev/signup-token.
   */
  static async generateSignupToken() {
    // Allow in development or when Cypress is running (for E2E tests in production builds)
    const isCypressRunning = typeof window !== 'undefined' && 'Cypress' in window;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !isCypressRunning) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'generateSignupToken is only available in non-production environments.',
        {
          service: ErrorService.Homeserver,
          operation: 'generateSignupToken',
          context: { isProduction, isCypressRunning },
        },
      );
    }

    // Call server-side API route to generate token (keeps admin credentials secure)
    const response = await fetch('/api/dev/signup-token', {
      method: 'GET',
    });

    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Homeserver, 'generateSignupToken', '/api/dev/signup-token');
    }

    const data = await response.json();
    if (!data.token) {
      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'No token received from server', {
        service: ErrorService.Homeserver,
        operation: 'generateSignupToken',
      });
    }

    return data.token;
  }
}
