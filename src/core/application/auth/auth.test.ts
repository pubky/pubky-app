import type { Keypair, Session } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import type { THomeserverAuthenticateParams } from '@/application/auth/auth.types';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { THomeserverSignUpParams } from '@/services/homeserver/homeserver.types';
import { mockSession } from '@/test-utils/pubky';
import { mockAuthStore } from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';

const spyOnSleep = async () => vi.spyOn(await import('@/libs/utils/utils'), 'sleep').mockResolvedValue(undefined);

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
  userUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/profile.json`,
}));

describe('AuthApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    const createParams = (): THomeserverSignUpParams => ({
      keypair: asOpaque<Keypair>({
        publicKey: vi.fn(() => ({ z32: () => 'test-pubky' })),
        secret: vi.fn(() => new Uint8Array([1, 2, 3])),
      }),
      signupToken: 'test-signup-token',
    });

    it('should sign up successfully', async () => {
      const params = createParams();
      const session = asOpaque<Session>({ token: 'test-token' });
      const expectedResult = { session };

      const signUpSpy = vi.spyOn(HomeserverService, 'signUp').mockResolvedValue(expectedResult);

      const result = await AuthApplication.signUp(params);

      expect(signUpSpy).toHaveBeenCalledWith({ keypair: params.keypair, signupToken: params.signupToken });
      expect(result).toEqual(expectedResult);
    });

    it('should propagate error when signup fails', async () => {
      const params = createParams();
      const signUpSpy = vi.spyOn(HomeserverService, 'signUp').mockRejectedValue(new Error('Signup failed'));

      await expect(AuthApplication.signUp(params)).rejects.toThrow('Signup failed');
      expect(signUpSpy).toHaveBeenCalledOnce();
    });
  });

  describe('signIn', () => {
    const createParams = (): THomeserverAuthenticateParams => ({
      keypair: asOpaque<Keypair>({
        publicKey: vi.fn(() => ({ z32: () => 'test-pubky' })),
        secret: vi.fn(() => new Uint8Array([1, 2, 3])),
      }),
      secretKey: 'test-secret-key',
    });

    it('should successfully authenticate and return result', async () => {
      const params = createParams();
      const session = asOpaque<Session>({ token: 'test-token' });
      const expectedResult = { session };

      const signInSpy = vi.spyOn(HomeserverService, 'signIn').mockResolvedValue(expectedResult);

      const result = await AuthApplication.signIn(params);

      expect(signInSpy).toHaveBeenCalledWith({ keypair: params.keypair });
      expect(result).toEqual(expectedResult);
    });

    it('should return undefined when homeserver is not found during authentication', async () => {
      const params = createParams();
      const signInSpy = vi.spyOn(HomeserverService, 'signIn').mockResolvedValue(undefined);

      const result = await AuthApplication.signIn(params);

      expect(signInSpy).toHaveBeenCalledWith({ keypair: params.keypair });
      expect(result).toBeUndefined();
    });

    it('should propagate error when authentication throws', async () => {
      const params = createParams();
      const signInSpy = vi.spyOn(HomeserverService, 'signIn').mockRejectedValue(new Error('Authentication failed'));

      await expect(AuthApplication.signIn(params)).rejects.toThrow('Authentication failed');
      expect(signInSpy).toHaveBeenCalledOnce();
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate and return auth URL', async () => {
      const session = asOpaque<Session>({ token: 'test-token' });
      const cancelAuthFlow = vi.fn();
      const expectedResult = {
        authorizationUrl: 'https://example.com/auth?token=test-token',
        awaitApproval: Promise.resolve(session),
        cancelAuthFlow,
      };

      const generateAuthUrlSpy = vi.spyOn(HomeserverService, 'generateAuthUrl').mockResolvedValue(expectedResult);

      const result = await AuthApplication.generateAuthUrl();

      expect(generateAuthUrlSpy).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should propagate error when URL generation fails', async () => {
      const generateAuthUrlSpy = vi
        .spyOn(HomeserverService, 'generateAuthUrl')
        .mockRejectedValue(new Error('Failed to generate auth URL'));

      await expect(AuthApplication.generateAuthUrl()).rejects.toThrow('Failed to generate auth URL');
      expect(generateAuthUrlSpy).toHaveBeenCalledOnce();
    });
  });

  describe('logout', () => {
    it('should successfully logout', async () => {
      const session = mockSession({ signout: vi.fn() });
      const params = { session };
      const logoutSpy = vi.spyOn(HomeserverService, 'logout').mockResolvedValue(undefined);

      await AuthApplication.logout(params);

      expect(logoutSpy).toHaveBeenCalledWith(params);
    });

    it('should propagate error when logout fails', async () => {
      const session = mockSession({ signout: vi.fn() });
      const params = { session };
      const logoutSpy = vi.spyOn(HomeserverService, 'logout').mockRejectedValue(new Error('Logout failed'));

      await expect(AuthApplication.logout(params)).rejects.toThrow('Logout failed');
      expect(logoutSpy).toHaveBeenCalledOnce();
    });
  });

  describe('generateSignupToken', () => {
    it('should generate signup token successfully', async () => {
      const generateSignupTokenSpy = vi.spyOn(HomeserverService, 'generateSignupToken').mockResolvedValue('test-token');

      const result = await AuthApplication.generateSignupToken();

      expect(generateSignupTokenSpy).toHaveBeenCalled();
      expect(result).toBe('test-token');
    });

    it('should propagate error when signup token generation fails', async () => {
      const generateSignupTokenSpy = vi
        .spyOn(HomeserverService, 'generateSignupToken')
        .mockRejectedValue(new Error('Failed to generate signup token'));

      await expect(AuthApplication.generateSignupToken()).rejects.toThrow('Failed to generate signup token');
      expect(generateSignupTokenSpy).toHaveBeenCalledOnce();
    });
  });

  describe('verifySignupToken', () => {
    it('should return valid when the homeserver reports the token is valid', async () => {
      const verifySpy = vi.spyOn(HomeserverService, 'verifySignupToken').mockResolvedValue('valid');

      const result = await AuthApplication.verifySignupToken('YVB2-YFRN-GDY0');

      expect(verifySpy).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
      expect(result).toBe('valid');
    });

    it('should return used when the homeserver reports the token is used', async () => {
      const verifySpy = vi.spyOn(HomeserverService, 'verifySignupToken').mockResolvedValue('used');

      const result = await AuthApplication.verifySignupToken('YVB2-YFRN-GDY0');

      expect(verifySpy).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
      expect(result).toBe('used');
    });

    it('should return invalid when the homeserver does not recognise the token', async () => {
      const verifySpy = vi.spyOn(HomeserverService, 'verifySignupToken').mockResolvedValue('invalid');

      const result = await AuthApplication.verifySignupToken('BADC-0DE0-0000');

      expect(verifySpy).toHaveBeenCalledWith('BADC-0DE0-0000');
      expect(result).toBe('invalid');
    });
  });

  describe('restorePersistedSession', () => {
    const createMockAuthStore = (sessionExport: string | null = 'mock-session-export') =>
      mockAuthStore({
        sessionExport,
        isRestoringSession: false,
        setIsRestoringSession: vi.fn(),
        init: vi.fn(),
      });

    const createNetworkError = () =>
      new AppError({
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        message: 'ERR_NETWORK_CHANGED',
        service: ErrorService.Homeserver,
        operation: 'restoreSession',
      });

    const createAuthError = () =>
      new AppError({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.SESSION_EXPIRED,
        message: 'Session expired',
        service: ErrorService.Homeserver,
        operation: 'restoreSession',
      });

    let sleepSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      sleepSpy = await spyOnSleep();
    });

    it('should restore session successfully on first attempt', async () => {
      const authStore = createMockAuthStore();
      const session = asOpaque<Session>({ token: 'test-token' });
      const restoreSpy = vi.spyOn(HomeserverService, 'restoreSession').mockResolvedValue(session);

      const result = await AuthApplication.restorePersistedSession({ authStore });

      expect(restoreSpy).toHaveBeenCalledOnce();
      expect(result).toEqual({ session });
      // Ensure loading state is toggled: true on start, false on finish (prevents stuck spinner)
      expect(authStore.setIsRestoringSession).toHaveBeenCalledWith(true);
      expect(authStore.setIsRestoringSession).toHaveBeenCalledWith(false);
      // Ensure no sleep calls during restoration because session is restored immediately
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    it('should return null when sessionExport is missing', async () => {
      const authStore = createMockAuthStore(null);

      const result = await AuthApplication.restorePersistedSession({ authStore });

      expect(result).toBeNull();
    });

    it('should retry on retryable error and succeed on subsequent attempt', async () => {
      const authStore = createMockAuthStore();
      const session = asOpaque<Session>({ token: 'test-token' });
      // Simulate: 1st call fails (network), 2nd call fails (network), 3rd call succeeds
      const restoreSpy = vi
        .spyOn(HomeserverService, 'restoreSession')
        .mockRejectedValueOnce(createNetworkError())
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce(session);

      const result = await AuthApplication.restorePersistedSession({ authStore });

      expect(restoreSpy).toHaveBeenCalledTimes(3);
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ session });
    });

    // Errors like expired session (Auth category) are permanent — retrying won't help.
    // Only transient errors (Network, Timeout, Server) should trigger retries.
    it('should not retry on non-retryable AppError', async () => {
      const authStore = createMockAuthStore();
      const restoreSpy = vi.spyOn(HomeserverService, 'restoreSession').mockRejectedValueOnce(createAuthError()); // Non-retryable error

      const result = await AuthApplication.restorePersistedSession({ authStore });

      expect(restoreSpy).toHaveBeenCalledOnce();
      expect(sleepSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should not retry on non-AppError (plain Error)', async () => {
      const authStore = createMockAuthStore();
      const restoreSpy = vi
        .spyOn(HomeserverService, 'restoreSession')
        .mockRejectedValueOnce(new Error('Unknown error'));

      const result = await AuthApplication.restorePersistedSession({ authStore });

      expect(restoreSpy).toHaveBeenCalledOnce();
      expect(sleepSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null after exhausting all retry attempts', async () => {
      const authStore = createMockAuthStore();
      const restoreSpy = vi.spyOn(HomeserverService, 'restoreSession').mockRejectedValue(createNetworkError());

      const result = await AuthApplication.restorePersistedSession({ authStore });

      // 10 attempts total (RESTORE_MAX_ATTEMPTS)
      expect(restoreSpy).toHaveBeenCalledTimes(10);
      // 10 attempts but only 9 sleeps: on the 10th attempt, `attempt < MAX` is false so it breaks instead of sleeping
      expect(sleepSpy).toHaveBeenCalledTimes(9);
      expect(result).toBeNull();
      expect(authStore.setIsRestoringSession).toHaveBeenCalledWith(false);
    });

    // Verifies the finally block always resets loading state, even when restoration fails.
    // Without this, the UI would be stuck on a loading spinner after an error.
    it('should always reset isRestoringSession to false even on failure', async () => {
      const authStore = createMockAuthStore();
      vi.spyOn(HomeserverService, 'restoreSession').mockRejectedValue(createAuthError());

      await AuthApplication.restorePersistedSession({ authStore });

      expect(authStore.setIsRestoringSession).toHaveBeenCalledWith(true);
      expect(authStore.setIsRestoringSession).toHaveBeenLastCalledWith(false);
    });
  });

  describe('userIsSignedUp', () => {
    const testPubky = 'test-pubky' as Pubky;

    it('should return true when profile.json exists', async () => {
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue({ name: 'Test' });

      const result = await AuthApplication.userIsSignedUp({ pubky: testPubky });

      expect(result).toBe(true);
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.GET,
        url: `pubky://${testPubky}/pub/pubky.app/profile.json`,
      });
    });

    it('should return false when profile.json is not found (404)', async () => {
      const notFoundError = Err.client(ClientErrorCode.NOT_FOUND, 'Profile not found', {
        service: ErrorService.Homeserver,
        operation: 'userIsSignedUp',
      });
      vi.spyOn(HomeserverService, 'request').mockRejectedValue(notFoundError);

      const result = await AuthApplication.userIsSignedUp({ pubky: testPubky });

      expect(result).toBe(false);
    });

    it('should throw when request fails with non-404 error', async () => {
      const serverError = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Server error', {
        service: ErrorService.Homeserver,
        operation: 'userIsSignedUp',
      });
      vi.spyOn(HomeserverService, 'request').mockRejectedValue(serverError);

      await expect(AuthApplication.userIsSignedUp({ pubky: testPubky })).rejects.toMatchObject({
        code: ServerErrorCode.INTERNAL_ERROR,
      });
    });
  });
});
