import type { Keypair, PublicKey, Session } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { asOpaque } from '@/test-utils/type-assertions';

// =============================================================================
// HOISTED MOCKS - Must be hoisted to run before module imports
// =============================================================================

const mockState = vi.hoisted(() => ({
  // Signer methods
  signup: vi.fn(),
  signin: vi.fn(),
  publishHomeserverForce: vi.fn(),
  // Session methods
  sessionSignout: vi.fn(),
  // Session storage
  sessionStorageGet: vi.fn(),
  sessionStorageExists: vi.fn(),
  sessionStoragePutJson: vi.fn(),
  sessionStoragePutBytes: vi.fn(),
  sessionStorageDelete: vi.fn(),
  sessionStorageList: vi.fn(),
  // Client methods
  clientFetch: vi.fn(),
  // Public storage
  publicStorageGet: vi.fn(),
  publicStorageExists: vi.fn(),
  publicStorageList: vi.fn(),
  // Pubky methods
  getHomeserverOf: vi.fn(),
  startAuthFlow: vi.fn(),
  authFlowKindSignin: vi.fn(),
  eventStreamForUser: vi.fn(),
  // Auth store session
  currentSession: null as Session | null,
}));

// Mock global fetch for generateSignupToken tests (calls /api/dev/signup-token)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock pubky-app-specs to avoid WebAssembly issues
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

// Mock Logger to suppress console output during tests
vi.mock('@/libs/logger/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useAuthStore to provide session
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => {
        // Access mockState.currentSession at call time, not at mock creation time
        return mockState.currentSession;
      },
    }),
  },
}));

// =============================================================================
// MOCK @synonymdev/pubky MODULE
// =============================================================================

vi.mock('@synonymdev/pubky', () => {
  const createMockPubkyInstance = () => ({
    getHomeserverOf: (...args: unknown[]) => mockState.getHomeserverOf(...args),
    startAuthFlow: (...args: unknown[]) => mockState.startAuthFlow(...args),
    eventStreamForUser: (...args: unknown[]) => mockState.eventStreamForUser(...args),
    client: {
      fetch: (...args: unknown[]) => mockState.clientFetch(...args),
    },
    publicStorage: {
      get: (...args: unknown[]) => mockState.publicStorageGet(...args),
      exists: (...args: unknown[]) => mockState.publicStorageExists(...args),
      list: (...args: unknown[]) => mockState.publicStorageList(...args),
    },
    signer: () => ({
      signup: (...args: unknown[]) => mockState.signup(...args),
      signin: (...args: unknown[]) => mockState.signin(...args),
      pkdns: {
        publishHomeserverForce: (...args: unknown[]) => mockState.publishHomeserverForce(...args),
      },
    }),
  });

  const MockPubky = vi.fn().mockImplementation(createMockPubkyInstance);
  // @ts-expect-error - Adding static testnet method
  MockPubky.testnet = vi.fn().mockImplementation(createMockPubkyInstance);

  return {
    Pubky: MockPubky,
    PublicKey: {
      from: vi.fn().mockReturnValue({
        z32: () => 'homeserver-public-key-z32',
      }),
    },
    Keypair: {
      random: vi.fn(),
      fromSecret: vi.fn(),
    },
    AuthFlowKind: {
      signin: () => mockState.authFlowKindSignin(),
    },
    resolvePubky: vi.fn((url: string) => url.replace('pubky://', 'https://')),
  };
});

// =============================================================================
// HELPER FACTORIES
// =============================================================================

/**
 * Creates a mock Session object
 */
const createMockSession = (): Session =>
  asOpaque<Session>({
    info: {
      publicKey: {
        z32: () => 'user',
      },
    },
    storage: {
      get: (...args: unknown[]) => mockState.sessionStorageGet(...args),
      exists: (...args: unknown[]) => mockState.sessionStorageExists(...args),
      putJson: (...args: unknown[]) => mockState.sessionStoragePutJson(...args),
      putBytes: (...args: unknown[]) => mockState.sessionStoragePutBytes(...args),
      delete: (...args: unknown[]) => mockState.sessionStorageDelete(...args),
      list: (...args: unknown[]) => mockState.sessionStorageList(...args),
    },
    signout: (...args: unknown[]) => mockState.sessionSignout(...args),
  });

/**
 * Creates a mock Keypair
 */
const createMockKeypair = (): Keypair =>
  asOpaque<Keypair>({
    publicKey: {
      z32: () => 'test-public-key-z32',
    } as PublicKey,
    secret: vi.fn(() => new Uint8Array(32).fill(1)),
  });

/**
 * Temporarily declare a staging deploy (PUBKY_RUNTIME_ENV=staging) and point
 * runtime config at canonical staging homeserver values.
 */
async function withStagingHomeserverEnv(
  run: () => Promise<void>,
  { keepTestHomeserver = false }: { keepTestHomeserver?: boolean } = {},
): Promise<void> {
  const { resetRuntimeConfigForTests } = await import('@/libs/runtime-config/runtime-config');
  const { NETWORK_RUNTIME_DEFAULTS } = await import('@/libs/runtime-config/runtime-config.schema');

  const previousDeployEnv = process.env.PUBKY_RUNTIME_ENV;
  const previousHomeserver = process.env.PUBKY_RUNTIME_HOMESERVER;
  const previousHomeserverUrl = process.env.PUBKY_RUNTIME_HOMESERVER_URL;
  process.env.PUBKY_RUNTIME_ENV = 'staging';
  if (!keepTestHomeserver) {
    process.env.PUBKY_RUNTIME_HOMESERVER = NETWORK_RUNTIME_DEFAULTS.homeserver;
    process.env.PUBKY_RUNTIME_HOMESERVER_URL = NETWORK_RUNTIME_DEFAULTS.homeserverUrl;
  }
  resetRuntimeConfigForTests();

  try {
    await run();
  } finally {
    process.env.PUBKY_RUNTIME_ENV = previousDeployEnv;
    process.env.PUBKY_RUNTIME_HOMESERVER = previousHomeserver;
    process.env.PUBKY_RUNTIME_HOMESERVER_URL = previousHomeserverUrl;
    resetRuntimeConfigForTests();
  }
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('HomeserverService', () => {
  let HomeserverService: typeof import('@/services/homeserver/homeserver').HomeserverService;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockState.currentSession = null;

    // Setup default successful behaviors
    mockState.signup.mockResolvedValue(createMockSession());
    mockState.signin.mockResolvedValue(createMockSession());
    mockState.publishHomeserverForce.mockResolvedValue(undefined);
    mockState.clientFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    mockState.publicStorageGet.mockResolvedValue(new Response('{}', { status: 200 }));
    mockState.publicStorageExists.mockResolvedValue(true);
    mockState.publicStorageList.mockResolvedValue([]);
    mockState.getHomeserverOf.mockResolvedValue('https://test-homeserver.com');
    mockState.sessionSignout.mockResolvedValue(undefined);
    mockState.sessionStorageGet.mockResolvedValue(new Response('{}', { status: 200 }));
    mockState.sessionStorageExists.mockResolvedValue(true);
    mockState.sessionStoragePutJson.mockResolvedValue(undefined);
    mockState.sessionStoragePutBytes.mockResolvedValue(undefined);
    mockState.sessionStorageDelete.mockResolvedValue(undefined);
    mockState.sessionStorageList.mockResolvedValue([]);
    mockState.startAuthFlow.mockReturnValue({
      authorizationUrl: 'https://auth.example.com/authorize',
      tryPollOnce: vi.fn().mockResolvedValue(createMockSession()),
      free: vi.fn(),
    });
    mockState.authFlowKindSignin.mockReturnValue('signin-kind');
    mockState.eventStreamForUser.mockReturnValue({
      path: vi.fn().mockReturnThis(),
      live: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockResolvedValue(new ReadableStream()),
    });

    // Reset module cache and re-import
    vi.resetModules();
    ({ HomeserverService } = await import('@/services/homeserver/homeserver'));
  });

  // ===========================================================================
  // API SURFACE
  // ===========================================================================

  describe('API Surface', () => {
    it('should expose the expected public API', () => {
      expect(HomeserverService).toBeDefined();

      const expectedMethods = [
        'signUp',
        'verifySignupToken',
        'signIn',
        'logout',
        'generateAuthUrl',
        'request',
        'putBlob',
        'list',
        'delete',
        'get',
        'exists',
        'generateSignupToken',
        'subscribeUserEventStreamForPath',
      ] as const;

      expectedMethods.forEach((method) => {
        expect(typeof HomeserverService[method]).toBe('function');
      });
    });
  });

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  describe('Authentication', () => {
    describe('signUp', () => {
      it('should return session on successful signup', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'valid-signup-token';
        const expectedSession = createMockSession();

        mockState.signup.mockResolvedValue(expectedSession);

        const result = await HomeserverService.signUp({ keypair, signupToken });

        expect(result).toEqual({ session: expectedSession });
      });

      it('should call signer.signup with signup token', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'test-token';

        await HomeserverService.signUp({ keypair, signupToken });

        expect(mockState.signup).toHaveBeenCalledWith(
          expect.anything(), // homeserver public key
          signupToken,
        );
      });

      it('should throw SIGNUP_FAILED error when signup fails with Error', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'invalid-token';

        mockState.signup.mockRejectedValue(new Error('Invalid token'));

        await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should throw SIGNUP_FAILED error when signup fails with non-Error', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'bad-token';

        mockState.signup.mockRejectedValue('string error');

        await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should preserve original error message in error details', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'token';
        const originalMessage = 'Token expired';

        mockState.signup.mockRejectedValue(new Error(originalMessage));

        try {
          await HomeserverService.signUp({ keypair, signupToken });
          expect.fail('Should have thrown');
        } catch (error) {
          // Use name check instead of instanceof due to module reset
          expect((error as Error).name).toBe('AppError');
          // The original error message becomes the error message
          expect((error as AppError).message).toBe(originalMessage);
        }
      });
    });

    describe('verifySignupToken', () => {
      it('should return valid when the homeserver responds with status valid', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'valid' }), { status: 200 }));

        const result = await HomeserverService.verifySignupToken('YVB2-YFRN-GDY0');

        expect(result).toBe('valid');
        expect(mockState.clientFetch).toHaveBeenCalledWith(expect.stringContaining('/signup_tokens/YVB2-YFRN-GDY0'), {
          method: HttpMethod.GET,
        });
      });

      it('should return used when the homeserver responds with status used', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'used' }), { status: 200 }));

        const result = await HomeserverService.verifySignupToken('YVB2-YFRN-GDY0');

        expect(result).toBe('used');
      });

      it('should return invalid when the homeserver responds with 404', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(null, { status: 404 }));

        const result = await HomeserverService.verifySignupToken('BADC-0DE0-0000');

        expect(result).toBe('invalid');
      });

      it('should return invalid when the homeserver responds with an unexpected payload', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'unknown' }), { status: 200 }));

        const result = await HomeserverService.verifySignupToken('BADC-0DE0-0000');

        expect(result).toBe('invalid');
      });

      it('should rethrow when the homeserver cannot be reached', async () => {
        mockState.clientFetch.mockRejectedValue(new Error('network error'));

        await expect(HomeserverService.verifySignupToken('YVB2-YFRN-GDY0')).rejects.toThrow('network error');
      });

      it('should URL-encode the signup token', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'valid' }), { status: 200 }));

        await HomeserverService.verifySignupToken('AB CD/EF');

        expect(mockState.clientFetch).toHaveBeenCalledWith(expect.stringContaining('/signup_tokens/AB%20CD%2FEF'), {
          method: HttpMethod.GET,
        });
      });
    });

    describe('signIn', () => {
      it('should skip homeserver resolution when the deploy is not staging', async () => {
        const keypair = createMockKeypair();

        await HomeserverService.assertUserHomeserverAllowed({ publicKey: keypair.publicKey });

        expect(mockState.getHomeserverOf).not.toHaveBeenCalled();
      });

      it('should return session on successful signin', async () => {
        const keypair = createMockKeypair();
        const expectedSession = createMockSession();

        mockState.getHomeserverOf.mockResolvedValue('https://homeserver.example.com');
        mockState.signin.mockResolvedValue(expectedSession);

        const result = await HomeserverService.signIn({ keypair });

        expect(mockState.signin).toHaveBeenCalled();
        expect(result).toEqual({ session: expectedSession });
      });

      it('should check homeserver before signing in', async () => {
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockResolvedValue('https://homeserver.example.com');

        await HomeserverService.signIn({ keypair });

        expect(mockState.getHomeserverOf).toHaveBeenCalledWith(keypair.publicKey);
      });

      it('should attempt to republish homeserver and return undefined when the record is provably absent', async () => {
        // NOTE: This is intentional behavior - after republishing the homeserver,
        // the method returns undefined to signal the caller should retry signin.
        // The republish is a recovery mechanism when PKARR records are stale,
        // and only fires when the lookup RESOLVED to "no record".
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockResolvedValue(null);

        const result = await HomeserverService.signIn({ keypair });

        expect(mockState.publishHomeserverForce).toHaveBeenCalled();
        expect(result).toBeUndefined();
      });

      it('should not republish when the homeserver lookup fails outside staging', async () => {
        // A thrown lookup does not prove the record is absent — republishing on
        // it could overwrite an existing record that points elsewhere.
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockRejectedValue(new Error('PKARR relay unavailable'));

        await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
          category: ErrorCategory.Server,
        });
        expect(mockState.signin).not.toHaveBeenCalled();
        expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
      });

      it('should throw SESSION_EXPIRED error when both signin and republish fail', async () => {
        // NOTE: handleError converts 401 errors to SESSION_EXPIRED (see error.utils.ts)
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockResolvedValue(null);
        mockState.publishHomeserverForce.mockRejectedValue(new Error('Republish failed'));

        await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });

      it('should reject mismatched homeserver on staging without republishing', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockResolvedValue({
            z32: () => 'prod-homeserver-public-key-z32',
          });

          await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
          });
          expect(mockState.signin).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should reject an absent homeserver record on staging without republishing', async () => {
        // Absence cannot prove the key belongs to this deploy — it is rejected
        // like a mismatch (deterministic, non-retryable) rather than surfaced
        // as a transient server error.
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockResolvedValue(null);

          await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
          });
          expect(mockState.signin).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should not republish when homeserver resolution fails on staging', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockRejectedValue(new Error('PKARR relay unavailable'));

          await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
            category: ErrorCategory.Server,
          });
          expect(mockState.signin).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should allow signin on staging when PKARR homeserver matches configured homeserver', async () => {
        await withStagingHomeserverEnv(async () => {
          const { NETWORK_RUNTIME_DEFAULTS } = await import('@/libs/runtime-config/runtime-config.schema');
          const keypair = createMockKeypair();
          const expectedSession = createMockSession();
          mockState.getHomeserverOf.mockResolvedValue({
            z32: () => NETWORK_RUNTIME_DEFAULTS.homeserver,
          });
          mockState.signin.mockResolvedValue(expectedSession);

          const result = await HomeserverService.signIn({ keypair });

          expect(result).toEqual({ session: expectedSession });
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should keep the staging guard active when homeserver config drifts from the canonical defaults', async () => {
        // Regression: the guard is driven by the declared PUBKY_RUNTIME_ENV, not
        // by config equality with the compiled-in staging defaults — drift used
        // to silently disable it and re-enable the force-republish path.
        await withStagingHomeserverEnv(
          async () => {
            const keypair = createMockKeypair();
            mockState.getHomeserverOf.mockResolvedValue({
              z32: () => 'prod-homeserver-public-key-z32',
            });

            await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
              category: ErrorCategory.Auth,
              code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
            });
            expect(mockState.signin).not.toHaveBeenCalled();
            expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
          },
          { keepTestHomeserver: true },
        );
      });
    });

    describe('logout', () => {
      it('should sign out using the Session object', async () => {
        const session = createMockSession();

        await HomeserverService.logout({ session });

        expect(mockState.sessionSignout).toHaveBeenCalledOnce();
      });

      it('should throw error when signout fails', async () => {
        const session = createMockSession();
        mockState.sessionSignout.mockRejectedValue(new Error('Network error'));

        await expect(HomeserverService.logout({ session })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('generateAuthUrl', () => {
      it('should return authorizationUrl and awaitApproval promise', async () => {
        const result = await HomeserverService.generateAuthUrl();

        expect(result).toHaveProperty('authorizationUrl');
        expect(result).toHaveProperty('awaitApproval');
        expect(result).toHaveProperty('cancelAuthFlow');
        expect(typeof result.authorizationUrl).toBe('string');
        expect(result.awaitApproval).toBeInstanceOf(Promise);
      });

      it('should cancel polling before first poll when cancelAuthFlow is called immediately', async () => {
        vi.useFakeTimers();
        try {
          const tryPollOnce = vi.fn().mockResolvedValue(undefined);
          const free = vi.fn();
          mockState.startAuthFlow.mockReturnValue({
            authorizationUrl: 'https://auth.example.com/authorize',
            tryPollOnce,
            free,
          });

          const result = await HomeserverService.generateAuthUrl();
          const approvalPromise = result.awaitApproval;
          const rejection = expect(approvalPromise).rejects.toMatchObject({ name: 'AuthFlowCanceled' });

          result.cancelAuthFlow();
          await vi.runAllTimersAsync();

          await rejection;
          expect(tryPollOnce).not.toHaveBeenCalled();
          expect(free).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it('should reject with SESSION_EXPIRED when tryPollOnce throws (SDK exhausted its retry budget)', async () => {
        vi.useFakeTimers();
        try {
          const relayError = { name: 'RequestError', message: 'Gateway Timeout', data: { statusCode: 504 } };
          const tryPollOnce = vi.fn().mockRejectedValue(relayError);
          const free = vi.fn();
          mockState.startAuthFlow.mockReturnValue({
            authorizationUrl: 'https://auth.example.com/authorize',
            tryPollOnce,
            free,
          });

          const result = await HomeserverService.generateAuthUrl();
          const approvalPromise = result.awaitApproval;
          const rejection = expect(approvalPromise).rejects.toMatchObject({
            code: AuthErrorCode.SESSION_EXPIRED,
          });

          await vi.advanceTimersByTimeAsync(0);
          await rejection;

          // Loop must not retry on a dead flow; one throw is terminal.
          expect(tryPollOnce).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it('should call startAuthFlow with default capabilities', async () => {
        await HomeserverService.generateAuthUrl();

        expect(mockState.startAuthFlow).toHaveBeenCalledWith(
          '/pub/pubky.app/:rw', // Default capabilities
          'signin-kind', // AuthFlowKind.signin()
          expect.stringContaining('/inbox'), // HTTP relay (Pubky 0.7+ inbox endpoint)
        );
      });

      it('should call startAuthFlow with custom capabilities when provided', async () => {
        const customCaps = '/custom/path/:r';

        await HomeserverService.generateAuthUrl(customCaps);

        expect(mockState.startAuthFlow).toHaveBeenCalledWith(
          customCaps,
          'signin-kind',
          expect.stringContaining('/inbox'),
        );
      });

      it('should throw error when flow fails', async () => {
        mockState.startAuthFlow.mockImplementation(() => {
          throw new Error('Flow initialization failed');
        });

        await expect(HomeserverService.generateAuthUrl()).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });
  });

  // ===========================================================================
  // DATA OPERATIONS
  // ===========================================================================

  describe('Data Operations', () => {
    describe('request', () => {
      describe('GET requests', () => {
        it('should return parsed JSON for successful GET', async () => {
          mockState.currentSession = createMockSession();
          const testData = { name: 'test', value: 123 };
          mockState.sessionStorageGet.mockResolvedValue(new Response(JSON.stringify(testData), { status: 200 }));

          const result = await HomeserverService.request<typeof testData>({
            method: HttpMethod.GET,
            url: 'pubky://user/pub/data.json',
          });

          expect(result).toEqual(testData);
          expect(mockState.sessionStorageGet).toHaveBeenCalledWith('/pub/data.json');
        });

        it('should return undefined for empty GET response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(new Response('', { status: 200 }));

          const result = await HomeserverService.request({
            method: HttpMethod.GET,
            url: 'pubky://user/pub/empty.json',
          });

          expect(result).toBeUndefined();
        });

        it('should return undefined for invalid JSON response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(new Response('not-valid-json', { status: 200 }));

          const result = await HomeserverService.request({
            method: HttpMethod.GET,
            url: 'pubky://user/pub/invalid.json',
          });

          expect(result).toBeUndefined();
        });
      });

      describe('PUT requests', () => {
        it('should send JSON body for PUT request', async () => {
          mockState.currentSession = createMockSession();
          const bodyData = { name: 'new-value' };
          await HomeserverService.request({
            method: HttpMethod.PUT,
            url: 'pubky://user/pub/data.json',
            bodyJson: bodyData,
          });

          expect(mockState.sessionStoragePutJson).toHaveBeenCalledWith('/pub/data.json', bodyData);
        });

        it('should throw INVALID_INPUT when PUT is attempted without a session on a pubky:// address', async () => {
          mockState.currentSession = null;
          await expect(
            HomeserverService.request({
              method: HttpMethod.PUT,
              url: 'pubky://someone/pub/data.json',
              bodyJson: { ok: true },
            }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Validation,
            code: ValidationErrorCode.INVALID_INPUT,
          });
        });

        it('should return undefined for successful PUT', async () => {
          mockState.currentSession = createMockSession();

          const result = await HomeserverService.request({
            method: HttpMethod.PUT,
            url: 'pubky://user/pub/data.json',
            bodyJson: {
              data: 'test',
            },
          });

          expect(result).toBeUndefined();
        });
      });

      describe('DELETE requests', () => {
        it('should send DELETE request without body', async () => {
          mockState.currentSession = createMockSession();

          await HomeserverService.request({ method: HttpMethod.DELETE, url: 'pubky://user/pub/data.json' });

          expect(mockState.sessionStorageDelete).toHaveBeenCalledWith('/pub/data.json');
        });
      });

      describe('Error handling', () => {
        it('should throw NOT_FOUND error for 404 response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(
            new Response('Not Found', { status: 404, statusText: 'Not Found' }),
          );

          await expect(
            HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/missing.json' }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Client,
            code: ClientErrorCode.NOT_FOUND,
          });
        });

        it('should throw SESSION_EXPIRED error for 401 response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(
            new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
          );

          await expect(
            HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.SESSION_EXPIRED,
          });
        });

        it('should throw INTERNAL_ERROR for network errors', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockRejectedValue(new Error('Network error'));

          await expect(
            HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Server,
            code: ServerErrorCode.INTERNAL_ERROR,
          });
        });
      });
    });

    describe('putBlob', () => {
      it('should upload binary data successfully', async () => {
        mockState.currentSession = createMockSession();
        const blobData = new Uint8Array([1, 2, 3, 4, 5]);

        await HomeserverService.putBlob({ url: 'pubky://user/pub/avatar.png', blob: blobData });

        expect(mockState.sessionStoragePutBytes).toHaveBeenCalledWith('/pub/avatar.png', blobData);
      });

      it('should throw PAYLOAD_TOO_LARGE error for 413 response', async () => {
        mockState.currentSession = createMockSession();
        const blobData = new Uint8Array([1, 2, 3]);
        mockState.sessionStoragePutBytes.mockRejectedValue({
          name: 'RequestError',
          message: 'Payload Too Large',
          data: { statusCode: 413 },
        });

        await expect(
          HomeserverService.putBlob({ url: 'pubky://user/pub/large.bin', blob: blobData }),
        ).rejects.toMatchObject({
          category: ErrorCategory.Client,
          code: ClientErrorCode.PAYLOAD_TOO_LARGE,
        });
      });

      it('should throw SESSION_EXPIRED error for 401 response', async () => {
        mockState.currentSession = createMockSession();
        const blobData = new Uint8Array([1, 2, 3]);
        mockState.sessionStoragePutBytes.mockRejectedValue({
          name: 'AuthenticationError',
          message: 'Session expired',
          data: { statusCode: 401 },
        });

        await expect(
          HomeserverService.putBlob({ url: 'pubky://user/pub/avatar.png', blob: blobData }),
        ).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });

      it('should throw INVALID_INPUT when uploading blob without a session to a pubky:// address', async () => {
        mockState.currentSession = null;
        const blobData = new Uint8Array([1, 2, 3]);

        await expect(
          HomeserverService.putBlob({ url: 'pubky://someone/pub/avatar.png', blob: blobData }),
        ).rejects.toMatchObject({
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
        });
      });
    });

    describe('list', () => {
      it('should return array of file URLs', async () => {
        const mockFiles = ['file1.json', 'file2.json', 'file3.json'];
        mockState.publicStorageList.mockResolvedValue(mockFiles);

        const result = await HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' });

        expect(result).toEqual(mockFiles);
      });

      it('should use session.storage.list for owned directories when session is set', async () => {
        mockState.currentSession = createMockSession();
        const mockFiles = ['pubky://user/pub/posts/file1.json', 'pubky://user/pub/posts/file2.json'];
        mockState.sessionStorageList.mockResolvedValue(mockFiles);

        const result = await HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' });

        expect(result).toEqual(mockFiles);
        expect(mockState.sessionStorageList).toHaveBeenCalledWith(
          '/pub/posts/',
          null, // cursor
          false, // reverse
          500, // limit
          false, // shallow
        );
        expect(mockState.publicStorageList).not.toHaveBeenCalled();
      });

      it('should call list with default parameters', async () => {
        mockState.publicStorageList.mockResolvedValue([]);

        await HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' });

        expect(mockState.publicStorageList).toHaveBeenCalledWith(
          'pubky://user/pub/posts/',
          null, // cursor
          false, // reverse
          500, // limit
          false, // shallow
        );
      });

      it('should pass pagination parameters to list', async () => {
        mockState.publicStorageList.mockResolvedValue([]);

        await HomeserverService.list({
          baseDirectory: 'pubky://user/pub/posts/',
          cursor: 'cursor123',
          reverse: true,
          limit: 100,
        });

        expect(mockState.publicStorageList).toHaveBeenCalledWith(
          'pubky://user/pub/posts/',
          'cursor123',
          true,
          100,
          false,
        );
      });

      it('should throw INTERNAL_ERROR on list failure', async () => {
        mockState.publicStorageList.mockRejectedValue(new Error('List failed'));

        await expect(HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should return empty array when directory returns 404', async () => {
        mockState.publicStorageList.mockRejectedValue({ data: { statusCode: 404 } });

        const result = await HomeserverService.list({ baseDirectory: 'pubky://user/pub/missing/' });

        expect(result).toEqual([]);
      });
    });

    describe('listAll', () => {
      const baseDirectory = 'pubky://user/pub/posts/';
      const makeFiles = (count: number, offset = 0) =>
        Array.from({ length: count }, (_, i) => `${baseDirectory}file${String(offset + i).padStart(4, '0')}`);

      it('should return all files in a single page when below the page limit', async () => {
        const files = makeFiles(3);
        mockState.publicStorageList.mockResolvedValue(files);

        const result = await HomeserverService.listAll({ baseDirectory });

        expect(result).toEqual(files);
        expect(mockState.publicStorageList).toHaveBeenCalledTimes(1);
        expect(mockState.publicStorageList).toHaveBeenCalledWith(baseDirectory, null, false, 500, false);
      });

      it('should paginate with the last URL as cursor until a short page is returned', async () => {
        const page1 = makeFiles(500);
        const page2 = makeFiles(200, 500);
        mockState.publicStorageList.mockImplementation((_dir: string, cursor: string | null) =>
          Promise.resolve(cursor === null ? page1 : page2),
        );

        const result = await HomeserverService.listAll({ baseDirectory });

        expect(result).toEqual([...page1, ...page2]);
        expect(mockState.publicStorageList).toHaveBeenCalledTimes(2);
        expect(mockState.publicStorageList).toHaveBeenNthCalledWith(2, baseDirectory, page1[499], false, 500, false);
      });

      it('should stop after an empty page when the file count is an exact multiple of the page size', async () => {
        const page1 = makeFiles(500);
        mockState.publicStorageList.mockImplementation((_dir: string, cursor: string | null) =>
          Promise.resolve(cursor === null ? page1 : []),
        );

        const result = await HomeserverService.listAll({ baseDirectory });

        expect(result).toEqual(page1);
        expect(mockState.publicStorageList).toHaveBeenCalledTimes(2);
      });

      it('should propagate list failures', async () => {
        mockState.publicStorageList.mockRejectedValue(new Error('List failed'));

        await expect(HomeserverService.listAll({ baseDirectory })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('delete', () => {
      it('should call request with DELETE method', async () => {
        mockState.currentSession = createMockSession();

        await HomeserverService.delete('pubky://user/pub/file.json');

        expect(mockState.sessionStorageDelete).toHaveBeenCalledWith('/pub/file.json');
      });

      it('should throw FORBIDDEN error on delete failure with 403', async () => {
        // NOTE: For owned paths, delete uses session.storage.delete
        // handleError extracts status code from error.data.statusCode if available
        mockState.currentSession = createMockSession();
        mockState.sessionStorageDelete.mockRejectedValue({
          name: 'RequestError',
          message: 'Forbidden',
          data: { statusCode: 403 },
        });

        await expect(HomeserverService.delete('pubky://user/pub/protected.json')).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.FORBIDDEN,
        });
      });
    });

    describe('get', () => {
      it('should use publicStorage.get for fetching', async () => {
        const testUrl = 'pubky://user/pub/public.json';
        const mockResponse = new Response(JSON.stringify({ data: 'public' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        mockState.publicStorageGet.mockResolvedValue(mockResponse);

        const result = await HomeserverService.get(testUrl);

        expect(mockState.publicStorageGet).toHaveBeenCalledWith(testUrl);
        expect(result).toBeInstanceOf(Response);
        const jsonData = await result.json();
        expect(jsonData).toEqual({ data: 'public' });
      });

      it('should use session.storage.get for owned paths when session is set', async () => {
        mockState.currentSession = createMockSession();
        const testUrl = 'pubky://user/pub/private.json';
        const mockResponse = new Response(JSON.stringify({ data: 'private' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        mockState.sessionStorageGet.mockResolvedValue(mockResponse);

        const result = await HomeserverService.get(testUrl);

        expect(mockState.sessionStorageGet).toHaveBeenCalledWith('/pub/private.json');
        expect(mockState.publicStorageGet).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(Response);
        const jsonData = await result.json();
        expect(jsonData).toEqual({ data: 'private' });
      });

      it('should wrap errors from publicStorage.get as AppError', async () => {
        const testUrl = 'pubky://user/pub/data.json';
        const networkError = new Error('Network request failed');
        mockState.publicStorageGet.mockRejectedValue(networkError);

        await expect(HomeserverService.get(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('exists', () => {
      const testUrl = 'pubky://user/pub/resource.json';

      it('should return true for an owned resource that exists', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockResolvedValue(true);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(true);

        expect(mockState.sessionStorageExists).toHaveBeenCalledWith('/pub/resource.json');
        expect(mockState.publicStorageExists).not.toHaveBeenCalled();
      });

      it('should return false without error logging when an owned resource is missing', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockResolvedValue(false);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(false);

        expect(Logger.error).not.toHaveBeenCalled();
      });

      it('should normalize unexpected owned-storage failures', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockRejectedValue(new Error('Network failure'));

        await expect(HomeserverService.exists(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should preserve session-expiration handling for owned-storage failures', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockRejectedValue({
          name: 'RequestError',
          message: 'Session expired',
          data: { statusCode: 401 },
        });

        await expect(HomeserverService.exists(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });

      it('should use publicStorage.exists when the resource is not owned', async () => {
        mockState.publicStorageExists.mockResolvedValue(true);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(true);

        expect(mockState.publicStorageExists).toHaveBeenCalledWith(testUrl);
        expect(mockState.sessionStorageExists).not.toHaveBeenCalled();
      });

      it('should return false without error logging when a public resource is missing', async () => {
        mockState.publicStorageExists.mockResolvedValue(false);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(false);

        expect(Logger.error).not.toHaveBeenCalled();
      });

      it('should normalize unexpected public-storage failures', async () => {
        mockState.publicStorageExists.mockRejectedValue(new Error('Network failure'));

        await expect(HomeserverService.exists(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should return true for a successful HTTP response', async () => {
        const httpUrl = 'https://example.com/resource.json';
        mockState.clientFetch.mockResolvedValue(new Response('{}', { status: 200 }));

        await expect(HomeserverService.exists(httpUrl)).resolves.toBe(true);

        expect(mockState.clientFetch).toHaveBeenCalledWith(httpUrl);
      });

      it('should return false without error logging for an HTTP 404', async () => {
        mockState.clientFetch.mockResolvedValue(new Response('', { status: 404 }));

        await expect(HomeserverService.exists('https://example.com/missing.json')).resolves.toBe(false);

        expect(Logger.error).not.toHaveBeenCalled();
      });

      it('should normalize an unexpected HTTP response', async () => {
        mockState.clientFetch.mockResolvedValue(new Response('Server error', { status: 500 }));

        await expect(HomeserverService.exists('https://example.com/broken.json')).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should preserve session-expiration handling for HTTP responses', async () => {
        mockState.clientFetch.mockResolvedValue(new Response('Session expired', { status: 401 }));

        await expect(HomeserverService.exists('https://example.com/private.json')).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });
    });
  });

  // ===========================================================================
  // EDGE CASES & ERROR HANDLING
  // ===========================================================================

  describe('Edge Cases & Error Handling', () => {
    describe('handleError (private)', () => {
      it('should re-throw AppError instances without wrapping', async () => {
        const { Err: FreshErr } = await import('@/libs/error/error.factories');
        const appError = FreshErr.auth(AuthErrorCode.UNAUTHORIZED, 'Already an AppError', {
          service: ErrorService.Homeserver,
          operation: 'test',
        });
        mockState.signup.mockRejectedValue(appError);

        try {
          await HomeserverService.signUp({
            keypair: createMockKeypair(),
            signupToken: 'token',
          });
          expect.fail('Should have thrown');
        } catch (error) {
          // Should be the exact same error instance (not wrapped)
          expect(error).toBe(appError);
          expect((error as AppError).category).toBe(ErrorCategory.Auth);
          expect((error as AppError).code).toBe(AuthErrorCode.UNAUTHORIZED);
          expect((error as AppError).message).toBe('Already an AppError');
        }
      });
    });

    describe('Session expiration handling', () => {
      it('should include endpoint in SESSION_EXPIRED error context', async () => {
        const testUrl = 'pubky://user/pub/data.json';
        mockState.currentSession = createMockSession();
        mockState.sessionStorageGet.mockResolvedValue(new Response('Session expired', { status: 401 }));

        try {
          await HomeserverService.request({ method: HttpMethod.GET, url: testUrl });
          expect.fail('Should have thrown');
        } catch (error) {
          // Use name check instead of instanceof due to module reset
          expect((error as Error).name).toBe('AppError');
          expect((error as AppError).context?.endpoint).toContain('user/pub/data.json');
        }
      });

      it('should use custom error message from 401 response body', async () => {
        const customMessage = 'Your session has expired, please login again';
        mockState.currentSession = createMockSession();
        mockState.sessionStorageGet.mockResolvedValue(new Response(customMessage, { status: 401 }));

        try {
          await HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' });
          expect.fail('Should have thrown');
        } catch (error) {
          // Use name check instead of instanceof due to module reset
          expect((error as Error).name).toBe('AppError');
          expect((error as AppError).message).toBe(customMessage);
        }
      });
    });

    describe('generateSignupToken (via API route)', () => {
      it('should fetch token from server-side API route', async () => {
        const expectedToken = 'generated-signup-token-123';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ token: expectedToken }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        const result = await HomeserverService.generateSignupToken();

        expect(mockFetch).toHaveBeenCalledWith('/api/dev/signup-token', { method: 'GET' });
        expect(result).toBe(expectedToken);
      });

      it('should throw FORBIDDEN error for 403 response', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        await expect(HomeserverService.generateSignupToken()).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.FORBIDDEN,
        });
      });

      it('should throw UNEXPECTED_ERROR when no token received', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        await expect(HomeserverService.generateSignupToken()).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.UNKNOWN_ERROR,
        });
      });

      it('should return token from JSON response', async () => {
        const expectedToken = 'token-from-json';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ token: expectedToken }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        const result = await HomeserverService.generateSignupToken();

        expect(result).toBe(expectedToken);
      });
    });

    describe('subscribeUserEventStreamForPath', () => {
      it('normalizes SDK events and disposes raw WASM objects internally', async () => {
        const free = vi.fn();
        const path = vi.fn().mockReturnThis();
        const live = vi.fn().mockReturnThis();
        const subscribe = vi.fn().mockResolvedValue(
          new ReadableStream({
            start(controller) {
              controller.enqueue({ cursor: 'cursor-1', eventType: 'PUT', free });
              controller.close();
            },
          }),
        );

        mockState.eventStreamForUser.mockReturnValue({ path, live, subscribe });

        const stream = await HomeserverService.subscribeUserEventStreamForPath({
          userZ32: 'user-pubky',
          cursor: 'cursor-0',
          pathPrefix: '/pub/pubky.app/mutes/',
        });
        const reader = stream.getReader();

        const result = await reader.read();

        expect(path).toHaveBeenCalledWith('/pub/pubky.app/mutes/');
        expect(live).toHaveBeenCalled();
        expect(subscribe).toHaveBeenCalled();
        expect(result.value).toEqual({ cursor: 'cursor-1', eventType: 'PUT' });
        expect(result.value).not.toHaveProperty('free');
        expect(free).toHaveBeenCalledTimes(1);
      });
    });

    describe('URL resolution', () => {
      it('should use session storage paths for pubky URLs', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageGet.mockResolvedValue(new Response('{}', { status: 200 }));

        await HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' });

        expect(mockState.sessionStorageGet).toHaveBeenCalledWith('/pub/data.json');
      });
    });
  });
});
