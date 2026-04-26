import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LastReadResult } from 'pubky-app-specs';
import { AuthController } from './auth';
import * as Core from '@/core';
import {
  asOpaque,
  mockAuthStore,
  mockHomeStore,
  mockHotStore,
  mockLocalFilesStore,
  mockMigrationStore,
  mockNotificationStore,
  mockOnboardingStore,
  mockSearchStore,
  mockSession as buildMockSession,
  mockSettingsStore,
  mockSignInStore,
} from '@/test-utils';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';

const TEST_SECRET_KEY = Buffer.from(new Uint8Array(32).fill(1)).toString('hex');
const TEST_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';

const spyOnSleep = async () => vi.spyOn(await import('@/libs/utils/utils'), 'sleep').mockResolvedValue(undefined);
const spyOnClearCookies = async () =>
  vi.spyOn(await import('@/libs/utils/utils'), 'clearCookies').mockImplementation(() => {});
const spyOnClearAllQueryClients = async () =>
  vi
    .spyOn(await import('@/libs/query-client/query-client.factory'), 'clearAllQueryClients')
    .mockImplementation(() => {});

const getLastReadUrl = (pubky: string) => `pubky://${pubky}/pub/pubky.app/last_read`;

const createMockKeypair = () =>
  asOpaque<import('@synonymdev/pubky').Keypair>({
    pubky: vi.fn(() => ({ z32: () => 'test-pubky' })),
    secret: vi.fn(() => new Uint8Array(32).fill(1)),
    publicKey: vi.fn(() => ({ z32: () => 'test-pubky' })),
    free: vi.fn(),
  });

const createMockEncryptedFile = () =>
  new File([new Uint8Array([1, 2, 3, 4, 5])], 'recovery.bin', { type: 'application/octet-stream' });

const setupOnboardingStore = () => {
  vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(
    mockOnboardingStore({
      secretKey: TEST_SECRET_KEY,
      reset: storeMocks.resetOnboardingStore,
    }),
  );
};

const setupNotificationMocks = () => {
  vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(
    mockNotificationStore({
      setState: storeMocks.notificationInit,
    }),
  );

  vi.spyOn(Core.NotificationNormalizer, 'to').mockImplementation(
    (pubky: string) => ({ meta: { url: getLastReadUrl(pubky) } }) as LastReadResult,
  );
};

const setupAuthAndNotificationStores = () => {
  const authStore = storeMocks.getAuthState();
  vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
  vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(
    mockNotificationStore({
      setState: storeMocks.notificationInit,
    }),
  );
  return authStore;
};

// Mock pubky-app-specs to avoid WebAssembly issues
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

const storeMocks = vi.hoisted(() => {
  const resetAuthStore = vi.fn();
  const resetOnboardingStore = vi.fn();
  const resetSignInStore = vi.fn();
  const resetLocalFilesStore = vi.fn();
  const resetHomeStore = vi.fn();
  const resetHotStore = vi.fn();
  const resetSearchStore = vi.fn();
  const resetNotificationStore = vi.fn();
  const resetSettingsStore = vi.fn();
  const notificationInit = vi.fn();
  const initAuthStore = vi.fn();
  const setAuthUrlResolved = vi.fn();
  const setProfileChecked = vi.fn();
  const setSignInError = vi.fn();
  const resetMigrationStore = vi.fn();

  return {
    resetAuthStore,
    resetOnboardingStore,
    resetSignInStore,
    resetLocalFilesStore,
    resetHomeStore,
    resetHotStore,
    resetSearchStore,
    resetNotificationStore,
    resetSettingsStore,
    notificationInit,
    initAuthStore,
    setAuthUrlResolved,
    setProfileChecked,
    setSignInError,
    resetMigrationStore,
    getAuthState: vi.fn(() => ({
      init: initAuthStore,
      setSession: vi.fn(),
      setCurrentUserPubky: vi.fn(),
      setHasProfile: vi.fn(),
      setIsRestoringSession: vi.fn(),
      setHasHydrated: vi.fn(),
      reset: resetAuthStore,
      selectCurrentUserPubky: vi.fn(() => TEST_PUBKY),
      selectIsAuthenticated: vi.fn(() => false),
    })),
    getOnboardingState: vi.fn(() => ({
      reset: resetOnboardingStore,
    })),
    getNotificationState: vi.fn(() => ({
      setState: notificationInit,
      reset: resetNotificationStore,
    })),
    getSignInState: vi.fn(() => ({
      reset: resetSignInStore,
      setAuthUrlResolved,
      setProfileChecked,
      setError: setSignInError,
      authUrlResolved: false,
      profileChecked: false,
      bootstrapFetched: false,
      dataPersisted: false,
      homeserverSynced: false,
      error: null,
    })),
    getLocalFilesState: vi.fn(() => ({
      reset: resetLocalFilesStore,
    })),
    getHomeState: vi.fn(() => ({
      reset: resetHomeStore,
    })),
    getHotState: vi.fn(() => ({
      reset: resetHotStore,
    })),
    getSearchState: vi.fn(() => ({
      reset: resetSearchStore,
    })),
    getSettingsState: vi.fn(() => ({
      reset: resetSettingsStore,
    })),
  };
});

// Mock stores - simplified approach
vi.mock('@/core/stores', () => ({
  useAuthStore: {
    getState: storeMocks.getAuthState,
  },
  useOnboardingStore: {
    getState: storeMocks.getOnboardingState,
  },
  useNotificationStore: {
    getState: storeMocks.getNotificationState,
  },
  useSignInStore: {
    getState: storeMocks.getSignInState,
  },
  useLocalFilesStore: {
    getState: storeMocks.getLocalFilesState,
  },
  useHomeStore: {
    getState: storeMocks.getHomeState,
  },
  useHotStore: {
    getState: storeMocks.getHotState,
  },
  useSearchStore: {
    getState: storeMocks.getSearchState,
  },
  useSettingsStore: {
    getState: storeMocks.getSettingsState,
  },
  useMigrationStore: {
    getState: () => ({
      reset: storeMocks.resetMigrationStore,
      wasDbReset: false,
    }),
  },
}));

// Mock @synonymdev/pubky
vi.mock('@synonymdev/pubky', () => ({
  Keypair: {
    fromSecret: vi.fn(() => ({
      pubky: vi.fn(() => ({ z32: () => 'test-public-key' })),
      secret: vi.fn(() => new Uint8Array(32).fill(1)),
    })),
    random: vi.fn(() => ({
      pubky: vi.fn(() => ({ z32: () => 'test-public-key' })),
      secret: vi.fn(() => new Uint8Array(32).fill(1)),
    })),
  },
  createRecoveryFile: vi.fn(() => new Uint8Array([1, 2, 3, 4, 5])),
}));

// Admin credentials are now server-side only (not exposed to client)
vi.mock('@/libs/env/env', () => ({
  Env: {
    HOMESERVER_ADMIN_URL: 'http://test-admin.com',
    HOMESERVER_ADMIN_PASSWORD: 'test-password',
  },
}));

describe('AuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure migration store mock is always available
    vi.spyOn(Core.useMigrationStore, 'getState').mockReturnValue(
      mockMigrationStore({
        reset: storeMocks.resetMigrationStore,
        wasDbReset: false,
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('bootstrapWithDelay', () => {
    beforeEach(() => {
      setupNotificationMocks();
    });

    it('should wait 5 seconds, initialize bootstrap, and setState notification store', async () => {
      const notification: Core.NotificationState = { unread: 2, lastRead: 123, lastPolledTimestamp: undefined };
      const bootstrapResponse = { notification, remoteSettings: null };
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize').mockResolvedValue(bootstrapResponse);
      const sleepSpy = await spyOnSleep();

      const authStoreState = mockAuthStore({
        currentUserPubky: TEST_PUBKY,
        session: null,
        hasProfile: false,
        hasHydrated: false,
        sessionExport: null,
        isRestoringSession: false,
        selectIsAuthenticated: vi.fn(() => false),
        init: vi.fn(),
        setSession: vi.fn(),
        setCurrentUserPubky: vi.fn(),
        setHasProfile: vi.fn(),
        setHasHydrated: vi.fn(),
        setIsRestoringSession: vi.fn(),
        reset: vi.fn(),
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY),
      });
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(authStoreState);

      await AuthController.bootstrapWithDelay();

      expect(sleepSpy).toHaveBeenCalledWith(5000);
      expect(initializeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pubky: TEST_PUBKY,
          lastReadUrl: getLastReadUrl(TEST_PUBKY),
          localSettings: expect.any(Object),
        }),
        expect.any(Function), // onProgress callback
      );
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(notification);
      expect(authStoreState.setHasProfile).toHaveBeenCalledWith(true);
    });
  });

  describe('signUp', () => {
    beforeEach(() => {
      setupOnboardingStore();
    });

    it('should successfully sign up a user and call init', async () => {
      const keypair = createMockKeypair();
      const signupToken = 'test-token';
      const mockSession = buildMockSession();
      const mockPubky = 'test-pubky' as Core.Pubky;

      const signUpSpy = vi.spyOn(Core.AuthApplication, 'signUp').mockResolvedValue({
        session: mockSession,
      });
      const keypairFromSecretKeySpy = vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(keypair);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();

      const authStore = storeMocks.getAuthState();
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));

      const result = await AuthController.signUp({ secretKey: TEST_SECRET_KEY, signupToken });

      expect(clearAllQueryClientsSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalled();
      // Skip post-migration resync — new user has no homeserver data to resync
      expect(storeMocks.resetMigrationStore).toHaveBeenCalled();
      expect(keypairFromSecretKeySpy).toHaveBeenCalledWith(TEST_SECRET_KEY);
      expect(signUpSpy).toHaveBeenCalledWith({
        keypair,
        signupToken,
      });
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: false,
      });
      expect(result).toBeUndefined();
    });

    it('should throw error if signup fails', async () => {
      const keypair = createMockKeypair();
      const signupToken = 'invalid-token';

      const signUpSpy = vi.spyOn(Core.AuthApplication, 'signUp').mockRejectedValue(new Error('Signup failed'));
      const keypairFromSecretKeySpy = vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(keypair);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();

      await expect(AuthController.signUp({ secretKey: TEST_SECRET_KEY, signupToken })).rejects.toThrow('Signup failed');
      expect(clearAllQueryClientsSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(keypairFromSecretKeySpy).toHaveBeenCalledWith(TEST_SECRET_KEY);
      expect(signUpSpy).toHaveBeenCalledWith({
        keypair,
        signupToken,
      });
    });
  });

  describe('loginWithMnemonic', () => {
    beforeEach(() => {
      setupOnboardingStore();
      vi.spyOn(Core.NotificationNormalizer, 'to').mockReturnValue(
        asOpaque<LastReadResult>({
          meta: { url: 'pubky://test-pubky/pub/pubky.app/last_read' },
        }),
      );
    });

    it('should successfully login with mnemonic and bootstrap', async () => {
      const mnemonic = 'test mnemonic phrase';
      const mockKeypair = createMockKeypair();
      const mockSession = buildMockSession();
      const mockPubky = 'test-pubky' as Core.Pubky;
      const mockData = { session: mockSession };
      const mockNotification: Core.NotificationState = { unread: 0, lastRead: 123, lastPolledTimestamp: 0 };
      const bootstrapResponse = { notification: mockNotification, remoteSettings: null };

      const keypairSpy = vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      const signInSpy = vi.spyOn(Core.AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize').mockResolvedValue(bootstrapResponse);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();

      const _authStore = setupAuthAndNotificationStores();

      const result = await AuthController.loginWithMnemonic({ mnemonic });

      expect(clearAllQueryClientsSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalled();
      // Skip post-migration resync — bootstrap runs if user has profile, otherwise no data to resync
      expect(storeMocks.resetMigrationStore).toHaveBeenCalled();
      expect(keypairSpy).toHaveBeenCalledWith(mnemonic);
      expect(signInSpy).toHaveBeenCalledWith({ keypair: mockKeypair });
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(userIsSignedUpSpy).toHaveBeenCalledWith({ pubky: mockPubky });
      expect(initializeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pubky: mockPubky,
          lastReadUrl: getLastReadUrl('test-pubky'),
          localSettings: expect.any(Object),
        }),
        expect.any(Function), // onProgress callback
      );
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(mockNotification);
      // Session stored early with hasProfile: null, then setHasProfile called after bootstrap
      expect(_authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: null,
      });
      expect(_authStore.setHasProfile).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('should successfully login with mnemonic without bootstrap if user is not signed up', async () => {
      const mnemonic = 'test mnemonic phrase';
      const mockKeypair = createMockKeypair();
      const mockSession = buildMockSession();
      const mockPubky = 'test-pubky' as Core.Pubky;
      const mockData = { session: mockSession };

      const keypairSpy = vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      const signInSpy = vi.spyOn(Core.AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize');
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      const _authStore = setupAuthAndNotificationStores();

      const result = await AuthController.loginWithMnemonic({ mnemonic });

      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(keypairSpy).toHaveBeenCalledWith(mnemonic);
      expect(signInSpy).toHaveBeenCalledWith({ keypair: mockKeypair });
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(userIsSignedUpSpy).toHaveBeenCalledWith({ pubky: mockPubky });
      expect(initializeSpy).not.toHaveBeenCalled();
      // Session stored early with hasProfile: null, then setHasProfile called after check
      expect(_authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: null,
      });
      expect(_authStore.setHasProfile).toHaveBeenCalledWith(false);
      expect(result).toBe(true);
    });

    it('should return false if signIn returns undefined', async () => {
      const mnemonic = 'test mnemonic phrase';
      const mockKeypair = createMockKeypair();

      vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      vi.spyOn(Core.AuthApplication, 'signIn').mockResolvedValue(undefined);
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize');

      const result = await AuthController.loginWithMnemonic({ mnemonic });

      expect(initializeSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should throw error if signIn fails', async () => {
      const mnemonic = 'test mnemonic phrase';
      const mockKeypair = createMockKeypair();

      vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      vi.spyOn(Core.AuthApplication, 'signIn').mockRejectedValue(new Error('Authentication failed'));
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      await expect(AuthController.loginWithMnemonic({ mnemonic })).rejects.toThrow('Authentication failed');
    });
  });

  describe('loginWithEncryptedFile', () => {
    beforeEach(() => {
      setupOnboardingStore();
      vi.spyOn(Core.NotificationNormalizer, 'to').mockReturnValue(
        asOpaque<LastReadResult>({
          meta: { url: 'pubky://test-pubky/pub/pubky.app/last_read' },
        }),
      );
    });

    it('should successfully login with encrypted file and bootstrap', async () => {
      const encryptedFile = createMockEncryptedFile();
      const password = 'test-password';
      const mockKeypair = createMockKeypair();
      const mockSession = buildMockSession();
      const mockPubky = 'test-pubky' as Core.Pubky;
      const mockData = { session: mockSession };
      const mockNotification: Core.NotificationState = { unread: 0, lastRead: 123, lastPolledTimestamp: 0 };
      const bootstrapResponse = { notification: mockNotification, remoteSettings: null };

      const decryptSpy = vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(mockKeypair);
      const signInSpy = vi.spyOn(Core.AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize').mockResolvedValue(bootstrapResponse);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();

      const _authStore = setupAuthAndNotificationStores();

      const result = await AuthController.loginWithEncryptedFile({ encryptedFile, password });

      expect(clearAllQueryClientsSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(decryptSpy).toHaveBeenCalledWith({ encryptedFile, passphrase: password });
      expect(signInSpy).toHaveBeenCalledWith({ keypair: mockKeypair });
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(userIsSignedUpSpy).toHaveBeenCalledWith({ pubky: mockPubky });
      expect(initializeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pubky: mockPubky,
          lastReadUrl: getLastReadUrl('test-pubky'),
          localSettings: expect.any(Object),
        }),
        expect.any(Function), // onProgress callback
      );
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(mockNotification);
      // Session stored early with hasProfile: null, then setHasProfile called after bootstrap
      expect(_authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: null,
      });
      expect(_authStore.setHasProfile).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('should successfully login with encrypted file without bootstrap if user is not signed up', async () => {
      const encryptedFile = createMockEncryptedFile();
      const password = 'test-password';
      const mockKeypair = createMockKeypair();
      const mockSession = buildMockSession();
      const mockPubky = 'test-pubky' as Core.Pubky;
      const mockData = { session: mockSession };

      const decryptSpy = vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(mockKeypair);
      const signInSpy = vi.spyOn(Core.AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize');
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      const _authStore = setupAuthAndNotificationStores();

      const result = await AuthController.loginWithEncryptedFile({ encryptedFile, password });

      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(decryptSpy).toHaveBeenCalledWith({ encryptedFile, passphrase: password });
      expect(signInSpy).toHaveBeenCalledWith({ keypair: mockKeypair });
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(userIsSignedUpSpy).toHaveBeenCalledWith({ pubky: mockPubky });
      expect(initializeSpy).not.toHaveBeenCalled();
      // Session stored early with hasProfile: null, then setHasProfile called after check
      expect(_authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: null,
      });
      expect(_authStore.setHasProfile).toHaveBeenCalledWith(false);
      expect(result).toBe(true);
    });

    it('should return false if signIn returns undefined', async () => {
      const encryptedFile = createMockEncryptedFile();
      const password = 'test-password';
      const mockKeypair = createMockKeypair();

      vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(mockKeypair);
      vi.spyOn(Core.AuthApplication, 'signIn').mockResolvedValue(undefined);
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize');

      const result = await AuthController.loginWithEncryptedFile({ encryptedFile, password });

      expect(initializeSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should throw error if decryption fails', async () => {
      const encryptedFile = createMockEncryptedFile();
      const password = 'wrong-password';

      vi.spyOn(Identity, 'decryptRecoveryFile').mockRejectedValue(new Error('Decryption failed'));

      await expect(AuthController.loginWithEncryptedFile({ encryptedFile, password })).rejects.toThrow(
        'Decryption failed',
      );
    });

    it('should throw error if signIn fails', async () => {
      const encryptedFile = createMockEncryptedFile();
      const password = 'test-password';
      const mockKeypair = createMockKeypair();

      vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(mockKeypair);
      vi.spyOn(Core.AuthApplication, 'signIn').mockRejectedValue(new Error('Authentication failed'));
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      await expect(AuthController.loginWithEncryptedFile({ encryptedFile, password })).rejects.toThrow(
        'Authentication failed',
      );
    });
  });

  describe('getAuthUrl', () => {
    beforeEach(() => {
      setupOnboardingStore();
    });

    it('should generate auth URL successfully', async () => {
      const cancelAuthFlow = vi.fn();
      const mockAuthUrl = {
        authorizationUrl: 'https://example.com/auth?token=abc123',
        awaitApproval: Promise.resolve(buildMockSession()),
        cancelAuthFlow,
      };
      const generateAuthUrlSpy = vi.spyOn(Core.AuthApplication, 'generateAuthUrl').mockResolvedValue(mockAuthUrl);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      const result = await AuthController.getAuthUrl();

      expect(clearDatabaseSpy).toHaveBeenCalled();
      // Skip post-migration resync — full bootstrap below covers all data
      expect(storeMocks.resetMigrationStore).toHaveBeenCalled();
      expect(result.authorizationUrl).toEqual(mockAuthUrl.authorizationUrl);
      expect(result.awaitApproval).toBeInstanceOf(Promise);
      expect(result.cancelAuthFlow).toBe(cancelAuthFlow);
      expect(generateAuthUrlSpy).toHaveBeenCalled();
    });

    it('should throw error when auth URL generation fails', async () => {
      const generateAuthUrlSpy = vi
        .spyOn(Core.AuthApplication, 'generateAuthUrl')
        .mockRejectedValue(new Error('Failed to generate auth URL'));
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      await expect(AuthController.getAuthUrl()).rejects.toThrow('Failed to generate auth URL');
      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(generateAuthUrlSpy).toHaveBeenCalled();
    });

    it('should free stale auth flows when multiple requests overlap (StrictMode)', async () => {
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      const cancelAuthFlowA = vi.fn();
      const cancelAuthFlowB = vi.fn();

      type GenerateAuthUrlResult = Awaited<ReturnType<typeof Core.AuthApplication.generateAuthUrl>>;

      let resolveFirst!: (value: GenerateAuthUrlResult) => void;
      const first = new Promise<GenerateAuthUrlResult>((resolve) => {
        resolveFirst = resolve;
      });

      vi.spyOn(Core.AuthApplication, 'generateAuthUrl')
        .mockImplementationOnce(() => first)
        .mockResolvedValueOnce({
          authorizationUrl: 'https://example.com/auth?token=B',
          awaitApproval: new Promise(() => {}),
          cancelAuthFlow: cancelAuthFlowB,
        });

      const firstCall = AuthController.getAuthUrl();
      const secondCall = AuthController.getAuthUrl();

      // Resolve the first call after the second call already started.
      resolveFirst!({
        authorizationUrl: 'https://example.com/auth?token=A',
        awaitApproval: new Promise(() => {}),
        cancelAuthFlow: cancelAuthFlowA,
      });

      await secondCall;
      await firstCall;

      expect(cancelAuthFlowA).toHaveBeenCalled();
      expect(cancelAuthFlowB).not.toHaveBeenCalled();
    });
  });

  describe('getSignupAuthUrl', () => {
    beforeEach(() => {
      setupOnboardingStore();
    });

    it('should generate signup auth URL successfully with activeAuthFlow tracking', async () => {
      const cancelAuthFlow = vi.fn();
      const mockAuthUrl = {
        authorizationUrl: 'https://example.com/auth?token=signup123',
        awaitApproval: Promise.resolve(buildMockSession()),
        cancelAuthFlow,
      };
      const generateSignupAuthUrlSpy = vi
        .spyOn(Core.AuthApplication, 'generateSignupAuthUrl')
        .mockResolvedValue(mockAuthUrl);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      const result = await AuthController.getSignupAuthUrl('A9KM-7MJP-ERM9');

      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(generateSignupAuthUrlSpy).toHaveBeenCalledWith('A9KM-7MJP-ERM9');
      expect(result.authorizationUrl).toEqual(mockAuthUrl.authorizationUrl);
      expect(result.awaitApproval).toBeInstanceOf(Promise);
      expect(result.cancelAuthFlow).toBe(cancelAuthFlow);
    });

    it('should throw error when signup auth URL generation fails', async () => {
      const generateSignupAuthUrlSpy = vi
        .spyOn(Core.AuthApplication, 'generateSignupAuthUrl')
        .mockRejectedValue(new Error('Failed to generate signup auth URL'));
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      await expect(AuthController.getSignupAuthUrl('INVITE-CODE')).rejects.toThrow(
        'Failed to generate signup auth URL',
      );
      expect(generateSignupAuthUrlSpy).toHaveBeenCalledWith('INVITE-CODE');
    });

    it('should free stale auth flows when multiple requests overlap (StrictMode)', async () => {
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      const cancelAuthFlowA = vi.fn();
      const cancelAuthFlowB = vi.fn();

      type GenerateSignupAuthUrlResult = Awaited<ReturnType<typeof Core.AuthApplication.generateSignupAuthUrl>>;

      let resolveFirst!: (value: GenerateSignupAuthUrlResult) => void;
      const first = new Promise<GenerateSignupAuthUrlResult>((resolve) => {
        resolveFirst = resolve;
      });

      vi.spyOn(Core.AuthApplication, 'generateSignupAuthUrl')
        .mockImplementationOnce(() => first)
        .mockResolvedValueOnce({
          authorizationUrl: 'https://example.com/auth?token=B',
          awaitApproval: new Promise(() => {}),
          cancelAuthFlow: cancelAuthFlowB,
        });

      const firstCall = AuthController.getSignupAuthUrl('CODE-A');
      const secondCall = AuthController.getSignupAuthUrl('CODE-B');

      resolveFirst!({
        authorizationUrl: 'https://example.com/auth?token=A',
        awaitApproval: new Promise(() => {}),
        cancelAuthFlow: cancelAuthFlowA,
      });

      await secondCall;
      await firstCall;

      expect(cancelAuthFlowA).toHaveBeenCalled();
      expect(cancelAuthFlowB).not.toHaveBeenCalled();
    });
  });

  describe('restorePersistedSession', () => {
    it('should restore a session when sessionExport exists and store has hydrated', async () => {
      const mockSession = buildMockSession();
      const mockPubky = TEST_PUBKY as Core.Pubky;

      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        hasHydrated: true,
        session: null,
        sessionExport: 'session-export',
        hasProfile: true,
        isRestoringSession: false,
        setIsRestoringSession: vi.fn(),
        init: vi.fn(),
      });

      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(Core.AuthApplication, 'restorePersistedSession').mockResolvedValue({ session: mockSession });
      vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);

      const result = await AuthController.restorePersistedSession();

      expect(result).toBe(true);
      expect(Core.AuthApplication.restorePersistedSession).toHaveBeenCalledWith({ authStore });
      expect(Identity.z32FromSession).toHaveBeenCalledWith({ session: mockSession });
      expect(authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: true,
      });
    });

    it('should return false and run full cleanup when restoration fails', async () => {
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        hasHydrated: true,
        session: null,
        sessionExport: null,
        isRestoringSession: false,
        setIsRestoringSession: vi.fn(),
        init: vi.fn(),
      });

      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(Core.AuthApplication, 'restorePersistedSession').mockResolvedValue(null);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      const resetSpy = vi.spyOn(Core.PubkySpecsSingleton, 'reset');
      const homeStore = storeMocks.getHomeState();
      const searchStore = storeMocks.getSearchState();
      const notificationStore = storeMocks.getNotificationState();
      const settingsStore = storeMocks.getSettingsState();
      // Partial mocks: only mock the methods under test, cast via `unknown` to satisfy the full store type
      vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(mockHomeStore(homeStore));
      vi.spyOn(Core.useSearchStore, 'getState').mockReturnValue(mockSearchStore(searchStore));
      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(mockNotificationStore(notificationStore));
      vi.spyOn(Core.useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(settingsStore));

      const result = await AuthController.restorePersistedSession();

      expect(result).toBe(false);
      expect(authStore.init).not.toHaveBeenCalled();
      // cleanupLocalState should have been called
      expect(resetSpy).toHaveBeenCalled();
      expect(authStore.reset).toHaveBeenCalled();
      expect(homeStore.reset).toHaveBeenCalled();
      expect(searchStore.reset).toHaveBeenCalled();
      expect(notificationStore.reset).toHaveBeenCalled();
      expect(settingsStore.reset).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalled();
    });
  });

  describe('initializeAuthenticatedSession', () => {
    beforeEach(() => {
      setupNotificationMocks();
    });

    it('should stop any active auth flow polling when a session is initialized', async () => {
      const cancelAuthFlow = vi.fn();
      vi.spyOn(Core.AuthApplication, 'generateAuthUrl').mockResolvedValue({
        authorizationUrl: 'https://example.com/auth?token=abc123',
        awaitApproval: new Promise(() => {}),
        cancelAuthFlow,
      });
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);

      await AuthController.getAuthUrl();

      const mockSession = buildMockSession();
      vi.spyOn(Identity, 'z32FromSession').mockReturnValue(TEST_PUBKY as Core.Pubky);
      vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const authStore = storeMocks.getAuthState();
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));

      await AuthController.initializeAuthenticatedSession({ session: mockSession });

      expect(cancelAuthFlow).toHaveBeenCalled();
    });

    it('should initialize session and bootstrap if user is signed up', async () => {
      const mockSession = buildMockSession();
      const mockPubky = TEST_PUBKY as Core.Pubky;
      const notification: Core.NotificationState = { unread: 0, lastRead: 456, lastPolledTimestamp: 0 };
      const bootstrapResponse = { notification, remoteSettings: null };

      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize').mockResolvedValue(bootstrapResponse);

      const authStore = storeMocks.getAuthState();
      const signInStore = storeMocks.getSignInState();
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
      vi.spyOn(Core.useSignInStore, 'getState').mockReturnValue(mockSignInStore(signInStore));

      await AuthController.initializeAuthenticatedSession({ session: mockSession });

      expect(signInStore.reset).toHaveBeenCalled();
      expect(signInStore.setAuthUrlResolved).toHaveBeenCalledWith(true);
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(userIsSignedUpSpy).toHaveBeenCalledWith({ pubky: mockPubky });
      expect(signInStore.setProfileChecked).toHaveBeenCalledWith(true);
      expect(initializeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pubky: mockPubky,
          lastReadUrl: getLastReadUrl(TEST_PUBKY),
          localSettings: expect.any(Object),
        }),
        expect.any(Function), // onProgress callback
      );
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(notification);
      // Session stored early with hasProfile: null, then setHasProfile called after bootstrap
      expect(authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: null,
      });
      expect(authStore.setHasProfile).toHaveBeenCalledWith(true);
    });

    it('should initialize session without bootstrap if user is not signed up', async () => {
      const mockSession = buildMockSession();
      const mockPubky = TEST_PUBKY as Core.Pubky;

      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(Core.AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const initializeSpy = vi.spyOn(Core.BootstrapApplication, 'initialize');

      const authStore = storeMocks.getAuthState();
      const signInStore = storeMocks.getSignInState();
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
      vi.spyOn(Core.useSignInStore, 'getState').mockReturnValue(mockSignInStore(signInStore));

      await AuthController.initializeAuthenticatedSession({ session: mockSession });

      expect(signInStore.reset).toHaveBeenCalled();
      expect(signInStore.setAuthUrlResolved).toHaveBeenCalledWith(true);
      expect(z32FromSessionSpy).toHaveBeenCalledWith({ session: mockSession });
      expect(userIsSignedUpSpy).toHaveBeenCalledWith({ pubky: mockPubky });
      expect(signInStore.setProfileChecked).toHaveBeenCalledWith(true);
      expect(initializeSpy).not.toHaveBeenCalled();
      // Session stored early with hasProfile: null, then setHasProfile called after check
      expect(authStore.init).toHaveBeenCalledWith({
        session: mockSession,
        currentUserPubky: mockPubky,
        hasProfile: null,
      });
      expect(authStore.setHasProfile).toHaveBeenCalledWith(false);
    });
  });

  describe('logout', () => {
    const createAuthStore = (overrides: Partial<Core.AuthStore> = {}): Core.AuthStore =>
      mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: 'test-pubky' as Core.Pubky,
        session: buildMockSession(),
        hasProfile: false,
        hasHydrated: false,
        sessionExport: null,
        isRestoringSession: false,
        isLoggingOut: false,
        selectCurrentUserPubky: vi.fn(() => 'test-pubky' as Core.Pubky),
        setHasHydrated: vi.fn(),
        setIsRestoringSession: vi.fn(),
        setIsLoggingOut: vi.fn(),
        ...overrides,
      });

    const createOnboardingStore = () =>
      mockOnboardingStore({
        secretKey: TEST_SECRET_KEY,
        reset: storeMocks.resetOnboardingStore,
      });

    const createSignInStore = () => mockSignInStore(storeMocks.getSignInState());

    const createLocalFilesStore = () => mockLocalFilesStore(storeMocks.getLocalFilesState());

    beforeEach(() => {
      Object.defineProperty(document, 'cookie', { writable: true, value: '' });
      Object.defineProperty(window, 'location', { writable: true, value: { href: '' } });
      storeMocks.resetAuthStore.mockClear();
      storeMocks.resetOnboardingStore.mockClear();
      storeMocks.resetSignInStore.mockClear();
      storeMocks.resetLocalFilesStore.mockClear();
    });

    it('should successfully logout user, clear stores, cookies and redirect', async () => {
      const logoutSpy = vi.spyOn(Core.AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();
      const resetSpy = vi.spyOn(Core.PubkySpecsSingleton, 'reset');
      const resetTtlSpy = vi.spyOn(Core.TtlCoordinator, 'resetInstance');
      const resetStreamSpy = vi.spyOn(Core.StreamCoordinator, 'resetInstance');
      const resetNotifCoordSpy = vi.spyOn(Core.NotificationCoordinator, 'resetInstance');
      const postStreamQueueClearSpy = vi.spyOn(Core.postStreamQueue, 'clear');

      const signInStore = createSignInStore();
      const localFilesStore = createLocalFilesStore();
      const homeStore = storeMocks.getHomeState();
      const hotStore = storeMocks.getHotState();
      const searchStore = storeMocks.getSearchState();
      const notificationStore = storeMocks.getNotificationState();
      const settingsStore = storeMocks.getSettingsState();
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(Core.useSignInStore, 'getState').mockReturnValue(signInStore);
      vi.spyOn(Core.useLocalFilesStore, 'getState').mockReturnValue(localFilesStore);
      // Partial mocks: only mock the methods under test, cast via `unknown` to satisfy the full store type
      vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(mockHomeStore(homeStore));
      vi.spyOn(Core.useHotStore, 'getState').mockReturnValue(mockHotStore(hotStore));
      vi.spyOn(Core.useSearchStore, 'getState').mockReturnValue(mockSearchStore(searchStore));
      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(mockNotificationStore(notificationStore));
      vi.spyOn(Core.useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(settingsStore));

      document.cookie = 'testCookie=value; path=/';
      document.cookie = 'anotherCookie=anotherValue; path=/';

      await AuthController.logout();

      // Homeserver logout
      expect(logoutSpy).toHaveBeenCalledWith({ session: expect.anything() });

      // Singletons
      expect(resetSpy).toHaveBeenCalledOnce();
      expect(resetTtlSpy).toHaveBeenCalledOnce();
      expect(resetStreamSpy).toHaveBeenCalledOnce();
      expect(resetNotifCoordSpy).toHaveBeenCalledOnce();
      expect(postStreamQueueClearSpy).toHaveBeenCalledOnce();

      // Zustand stores
      expect(storeMocks.resetOnboardingStore).toHaveBeenCalledOnce();
      expect(storeMocks.resetAuthStore).toHaveBeenCalledOnce();
      expect(signInStore.reset).toHaveBeenCalledOnce();
      expect(localFilesStore.reset).toHaveBeenCalledOnce();
      expect(homeStore.reset).toHaveBeenCalledOnce();
      expect(hotStore.reset).toHaveBeenCalledOnce();
      expect(searchStore.reset).toHaveBeenCalledOnce();
      expect(notificationStore.reset).toHaveBeenCalledOnce();
      expect(settingsStore.reset).toHaveBeenCalledOnce();

      // Query clients
      expect(clearAllQueryClientsSpy).toHaveBeenCalledOnce();

      // Cookies (with locale excluded) and database
      expect(clearCookiesSpy).toHaveBeenCalledWith(['locale']);
      expect(clearDatabaseSpy).toHaveBeenCalledOnce();

      // Skip post-migration resync — full cleanup resets all state
      expect(storeMocks.resetMigrationStore).toHaveBeenCalled();
    });

    it('should log warning and clear local state even when homeserver logout fails', async () => {
      const logoutSpy = vi.spyOn(Core.AuthApplication, 'logout').mockRejectedValue(new Error('Network error'));
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      const localFilesStore = createLocalFilesStore();
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(Core.useLocalFilesStore, 'getState').mockReturnValue(localFilesStore);

      await AuthController.logout();
      expect(logoutSpy).toHaveBeenCalledWith({ session: expect.anything() });
      expect(warnSpy).toHaveBeenCalledWith('Homeserver logout failed, clearing local state anyway', {
        error: expect.any(Error),
      });
      // Local state should still be cleared even if homeserver logout fails
      expect(storeMocks.resetOnboardingStore).toHaveBeenCalled();
      expect(storeMocks.resetAuthStore).toHaveBeenCalled();
      expect(localFilesStore.reset).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });

    it('should restore a persisted session before homeserver logout when only sessionExport exists', async () => {
      const restoredSession = buildMockSession({
        export: vi.fn(() => 'restored-export'),
      });
      const logoutSpy = vi.spyOn(Core.AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();

      const authStore = createAuthStore({
        session: null,
        sessionExport: 'session-export',
      });
      const localFilesStore = createLocalFilesStore();
      const homeStore = storeMocks.getHomeState();
      const hotStore = storeMocks.getHotState();
      const searchStore = storeMocks.getSearchState();
      const notificationStore = storeMocks.getNotificationState();
      const settingsStore = storeMocks.getSettingsState();

      vi.spyOn(Core.useAuthStore, 'getState').mockImplementation(() => authStore);
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(Core.useSignInStore, 'getState').mockReturnValue(createSignInStore());
      vi.spyOn(Core.useLocalFilesStore, 'getState').mockReturnValue(localFilesStore);
      vi.spyOn(Core.useHomeStore, 'getState').mockReturnValue(mockHomeStore(homeStore));
      vi.spyOn(Core.useHotStore, 'getState').mockReturnValue(mockHotStore(hotStore));
      vi.spyOn(Core.useSearchStore, 'getState').mockReturnValue(mockSearchStore(searchStore));
      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(mockNotificationStore(notificationStore));
      vi.spyOn(Core.useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(settingsStore));

      const restorePersistedSessionSpy = vi
        .spyOn(AuthController, 'restorePersistedSession')
        .mockImplementation(async () => {
          authStore.session = restoredSession;
          authStore.sessionExport = null;
          return true;
        });

      await AuthController.logout();

      expect(restorePersistedSessionSpy).toHaveBeenCalledOnce();
      expect(logoutSpy).toHaveBeenCalledWith({ session: restoredSession });
      expect(clearCookiesSpy).toHaveBeenCalledWith(['locale']);
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });

    it('should not run local cleanup twice when persisted session restore fails', async () => {
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      const logoutSpy = vi.spyOn(Core.AuthApplication, 'logout').mockResolvedValue(undefined);

      const authStore = createAuthStore({
        session: null,
        sessionExport: 'session-export',
      });

      vi.spyOn(Core.useAuthStore, 'getState').mockImplementation(() => authStore);
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(AuthController, 'restorePersistedSession').mockResolvedValue(false);

      await AuthController.logout();

      expect(logoutSpy).not.toHaveBeenCalled();
      expect(clearCookiesSpy).not.toHaveBeenCalled();
      expect(clearDatabaseSpy).not.toHaveBeenCalled();
    });

    it('should reset PubkySpecsSingleton even when homeserver logout fails (issue #538)', async () => {
      vi.spyOn(Core.AuthApplication, 'logout').mockRejectedValue(new Error('Pubky resolution failed'));
      vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      const resetSpy = vi.spyOn(Core.PubkySpecsSingleton, 'reset');

      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());

      await AuthController.logout();

      // PubkySpecsSingleton should be reset even when homeserver logout fails
      // This ensures users can sign out even when their profile pubky cannot be resolved
      expect(resetSpy).toHaveBeenCalledOnce();
    });

    it('should clear all existing cookies', async () => {
      const logoutSpy = vi.spyOn(Core.AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();

      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());

      document.cookie = 'session=abc123; path=/';
      document.cookie = 'token=xyz789; path=/';
      document.cookie = 'user=john; path=/';

      await AuthController.logout();

      expect(logoutSpy).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw error if clearing the database fails', async () => {
      const logoutSpy = vi.spyOn(Core.AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = vi.spyOn(Core, 'clearDatabase').mockRejectedValue(new Error('clear failed'));
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();

      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(Core.useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());

      await expect(AuthController.logout()).rejects.toThrow('clear failed');
      expect(logoutSpy).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateSignupToken', () => {
    it('should generate signup token successfully', async () => {
      const generateSignupTokenSpy = vi
        .spyOn(Core.AuthApplication, 'generateSignupToken')
        .mockResolvedValue('test-token');
      const result = await AuthController.generateSignupToken();
      expect(result).toBe('test-token');
      expect(generateSignupTokenSpy).toHaveBeenCalled();
    });
  });
});
