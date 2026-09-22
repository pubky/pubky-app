import type { Keypair, Session } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import type { THomeserverAuthenticateParams } from '@/application/auth/auth.types';
import { AuthErrorCode, ClientErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
  userUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/profile.json`,
}));

describe('AuthApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const reference = { kind: 'cookie' as const, sessionExport: 'old-cookie-export' };
    const expectedPubky = 'user-pubky';
    const session = asOpaque<Session>({ info: { publicKey: { z32: () => expectedPubky } } });
    beforeEach(() => {
      vi.spyOn(HomeserverService, 'restoreReference').mockResolvedValue(session);
      vi.spyOn(HomeserverService, 'assertUserHomeserverAllowed').mockResolvedValue(undefined);
    });
    it('restores a valid legacy cookie without creating a grant', async () => {
      expect(await AuthApplication.restorePersistedSession({ reference, expectedPubky })).toEqual({
        status: 'restored',
        session,
      });
      expect(HomeserverService.restoreReference).toHaveBeenCalledWith(reference);
    });
    it('returns none without credentials', async () => {
      expect(await AuthApplication.restorePersistedSession({ reference: null, expectedPubky })).toEqual({
        status: 'none',
      });
      expect(HomeserverService.restoreReference).not.toHaveBeenCalled();
    });
    it('preserves a temporary failure for an explicit retry', async () => {
      const error = Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Offline', {
        service: ErrorService.Homeserver,
        operation: 'restore',
      });
      vi.mocked(HomeserverService.restoreReference).mockRejectedValue(error);
      expect(await AuthApplication.restorePersistedSession({ reference, expectedPubky })).toEqual({
        status: 'temporary-error',
        error,
      });
      expect(HomeserverService.restoreReference).toHaveBeenCalledOnce();
    });
    it('requires reauthorization for a rejected exchange without deleting it', async () => {
      const error = Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Expired', {
        service: ErrorService.Homeserver,
        operation: 'restore',
      });
      vi.mocked(HomeserverService.restoreReference).mockRejectedValue(error);
      expect(await AuthApplication.restorePersistedSession({ reference, expectedPubky })).toEqual({
        status: 'reauth-required',
        error,
      });
    });
    it('rejects a restored account mismatch', async () => {
      expect(await AuthApplication.restorePersistedSession({ reference, expectedPubky: 'another-user' })).toEqual({
        status: 'reauth-required',
      });
    });
    it('rejects an expired grant before contacting the SDK', async () => {
      expect(
        await AuthApplication.restorePersistedSession({
          reference: {
            kind: 'grant',
            sessionStoreId: 'record',
            clientId: 'staging.pubky.app',
            grantId: 'grant',
            grantExpiresAt: 1,
            tokenExpiresAt: 1,
          },
          expectedPubky,
        }),
      ).toEqual({ status: 'reauth-required' });
      expect(HomeserverService.restoreReference).not.toHaveBeenCalled();
    });
    it('surfaces the environment guard without discarding credentials', async () => {
      const error = Err.auth(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER, 'Wrong environment', {
        service: ErrorService.Homeserver,
        operation: 'guard',
      });
      vi.mocked(HomeserverService.assertUserHomeserverAllowed).mockRejectedValue(error);
      await expect(AuthApplication.restorePersistedSession({ reference, expectedPubky })).rejects.toBe(error);
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
