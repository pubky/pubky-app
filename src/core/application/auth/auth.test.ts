import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import { Err, ClientErrorCode, ErrorService, HttpMethod, ServerErrorCode } from '@/libs';
import type { Session, Keypair } from '@synonymdev/pubky';

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
  userUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/profile.json`,
}));

describe('AuthApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    const createParams = (): Core.THomeserverSignUpParams => ({
      keypair: {
        publicKey: vi.fn(() => ({ z32: () => 'test-pubky' })),
        secret: vi.fn(() => new Uint8Array([1, 2, 3])),
      } as unknown as Keypair,
      signupToken: 'test-signup-token',
    });

    it('should sign up successfully', async () => {
      const params = createParams();
      const mockSession = { token: 'test-token' } as unknown as Session;
      const expectedResult = { session: mockSession };

      const signUpSpy = vi.spyOn(Core.HomeserverService, 'signUp').mockResolvedValue(expectedResult);

      const result = await Core.AuthApplication.signUp(params);

      expect(signUpSpy).toHaveBeenCalledWith({ keypair: params.keypair, signupToken: params.signupToken });
      expect(result).toEqual(expectedResult);
    });

    it('should propagate error when signup fails', async () => {
      const params = createParams();
      const signUpSpy = vi.spyOn(Core.HomeserverService, 'signUp').mockRejectedValue(new Error('Signup failed'));

      await expect(Core.AuthApplication.signUp(params)).rejects.toThrow('Signup failed');
      expect(signUpSpy).toHaveBeenCalledOnce();
    });
  });

  describe('signIn', () => {
    const createParams = (): Core.THomeserverAuthenticateParams => ({
      keypair: {
        publicKey: vi.fn(() => ({ z32: () => 'test-pubky' })),
        secret: vi.fn(() => new Uint8Array([1, 2, 3])),
      } as unknown as Keypair,
      secretKey: 'test-secret-key',
    });

    it('should successfully authenticate and return result', async () => {
      const params = createParams();
      const mockSession = { token: 'test-token' } as unknown as Session;
      const expectedResult = { session: mockSession };

      const signInSpy = vi.spyOn(Core.HomeserverService, 'signIn').mockResolvedValue(expectedResult);

      const result = await Core.AuthApplication.signIn(params);

      expect(signInSpy).toHaveBeenCalledWith({ keypair: params.keypair });
      expect(result).toEqual(expectedResult);
    });

    it('should return undefined when homeserver is not found during authentication', async () => {
      const params = createParams();
      const signInSpy = vi.spyOn(Core.HomeserverService, 'signIn').mockResolvedValue(undefined);

      const result = await Core.AuthApplication.signIn(params);

      expect(signInSpy).toHaveBeenCalledWith({ keypair: params.keypair });
      expect(result).toBeUndefined();
    });

    it('should propagate error when authentication throws', async () => {
      const params = createParams();
      const signInSpy = vi
        .spyOn(Core.HomeserverService, 'signIn')
        .mockRejectedValue(new Error('Authentication failed'));

      await expect(Core.AuthApplication.signIn(params)).rejects.toThrow('Authentication failed');
      expect(signInSpy).toHaveBeenCalledOnce();
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate and return auth URL', async () => {
      const mockSession = { token: 'test-token' } as unknown as Session;
      const cancelAuthFlow = vi.fn();
      const expectedResult = {
        authorizationUrl: 'https://example.com/auth?token=test-token',
        awaitApproval: Promise.resolve(mockSession),
        cancelAuthFlow,
      };

      const generateAuthUrlSpy = vi.spyOn(Core.HomeserverService, 'generateAuthUrl').mockResolvedValue(expectedResult);

      const result = await Core.AuthApplication.generateAuthUrl();

      expect(generateAuthUrlSpy).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should propagate error when URL generation fails', async () => {
      const generateAuthUrlSpy = vi
        .spyOn(Core.HomeserverService, 'generateAuthUrl')
        .mockRejectedValue(new Error('Failed to generate auth URL'));

      await expect(Core.AuthApplication.generateAuthUrl()).rejects.toThrow('Failed to generate auth URL');
      expect(generateAuthUrlSpy).toHaveBeenCalledOnce();
    });
  });

  describe('logout', () => {
    it('should successfully logout', async () => {
      const mockSession = { signout: vi.fn() } as unknown as Session;
      const params = { session: mockSession };
      const logoutSpy = vi.spyOn(Core.HomeserverService, 'logout').mockResolvedValue(undefined);

      await Core.AuthApplication.logout(params);

      expect(logoutSpy).toHaveBeenCalledWith(params);
    });

    it('should propagate error when logout fails', async () => {
      const mockSession = { signout: vi.fn() } as unknown as Session;
      const params = { session: mockSession };
      const logoutSpy = vi.spyOn(Core.HomeserverService, 'logout').mockRejectedValue(new Error('Logout failed'));

      await expect(Core.AuthApplication.logout(params)).rejects.toThrow('Logout failed');
      expect(logoutSpy).toHaveBeenCalledOnce();
    });
  });

  describe('generateSignupToken', () => {
    it('should generate signup token successfully', async () => {
      const generateSignupTokenSpy = vi
        .spyOn(Core.HomeserverService, 'generateSignupToken')
        .mockResolvedValue('test-token');

      const result = await Core.AuthApplication.generateSignupToken();

      expect(generateSignupTokenSpy).toHaveBeenCalled();
      expect(result).toBe('test-token');
    });

    it('should propagate error when signup token generation fails', async () => {
      const generateSignupTokenSpy = vi
        .spyOn(Core.HomeserverService, 'generateSignupToken')
        .mockRejectedValue(new Error('Failed to generate signup token'));

      await expect(Core.AuthApplication.generateSignupToken()).rejects.toThrow('Failed to generate signup token');
      expect(generateSignupTokenSpy).toHaveBeenCalledOnce();
    });
  });

  describe('userIsSignedUp', () => {
    const testPubky = 'test-pubky' as Core.Pubky;

    it('should return true when profile.json exists', async () => {
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue({ name: 'Test' });

      const result = await Core.AuthApplication.userIsSignedUp({ pubky: testPubky });

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
      vi.spyOn(Core.HomeserverService, 'request').mockRejectedValue(notFoundError);

      const result = await Core.AuthApplication.userIsSignedUp({ pubky: testPubky });

      expect(result).toBe(false);
    });

    it('should throw when request fails with non-404 error', async () => {
      const serverError = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Server error', {
        service: ErrorService.Homeserver,
        operation: 'userIsSignedUp',
      });
      vi.spyOn(Core.HomeserverService, 'request').mockRejectedValue(serverError);

      await expect(Core.AuthApplication.userIsSignedUp({ pubky: testPubky })).rejects.toMatchObject({
        code: ServerErrorCode.INTERNAL_ERROR,
      });
    });
  });
});
