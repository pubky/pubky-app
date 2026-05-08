import { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { SettingsApplication } from '@/application/settings/settings';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { clearDatabase } from '@/database/franky/franky.helpers';
import * as i18nUtils from '@/i18n/utils';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { useHomeStore } from '@/stores/home/home.store';
import { useHotStore } from '@/stores/hot/hot.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import type { NotificationState } from '@/stores/notification/notification.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSearchStore } from '@/stores/search/search.store';
import { useSettingsStore } from '@/stores/settings/settings.store';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type NotificationPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { useSignInStore } from '@/stores/signIn/signIn.store';
import { mockSession as buildMockSession } from '@/test-utils/pubky';
import {
  mockAuthStore,
  mockHomeStore,
  mockHotStore,
  mockLocalFilesStore,
  mockMigrationStore,
  mockNotificationStore,
  mockOnboardingStore,
  mockSearchStore,
  mockSettingsStore,
  mockSignInStore,
} from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

const TEST_SECRET_KEY = Buffer.from(new Uint8Array(32).fill(1)).toString('hex');
const TEST_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const MOCK_ALLOWED_TYPES = [NotificationType.Follow, NotificationType.Reply];

const spyOnSleep = async () => vi.spyOn(await import('@/libs/utils/utils'), 'sleep').mockResolvedValue(undefined);
const spyOnClearCookies = async () =>
  vi.spyOn(await import('@/libs/utils/utils'), 'clearCookies').mockImplementation(() => {});
const spyOnClearAllQueryClients = async () =>
  vi
    .spyOn(await import('@/libs/query-client/query-client.factory'), 'clearAllQueryClients')
    .mockImplementation(() => {});

const getLastReadUrl = (pubky: string) => `pubky://${pubky}/pub/pubky.app/last_read`;

const createMockSettingsState = (overrides?: Partial<SettingsState>): SettingsState => ({
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  muted: [],
  language: 'en',
  updatedAt: 0,
  version: 1,
  ...overrides,
});

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
  vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(
    mockOnboardingStore({
      secretKey: TEST_SECRET_KEY,
      reset: storeMocks.resetOnboardingStore,
    }),
  );
};

const setupNotificationMocks = () => {
  vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
    mockNotificationStore({
      setState: storeMocks.notificationInit,
      reset: storeMocks.resetNotificationStore,
    }),
  );

  vi.spyOn(NotificationNormalizer, 'to').mockImplementation(
    (pubky: string) => ({ meta: { url: getLastReadUrl(pubky) } }) as LastReadResult,
  );

  // Settings sync is now handled in the controller (hydrateMeImAlive)
  vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);
  vi.spyOn(NotificationNormalizer, 'toEnabledTypes').mockReturnValue(MOCK_ALLOWED_TYPES);
};

const setupAuthAndNotificationStores = () => {
  const authStore = storeMocks.getAuthState();
  vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
  vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
    mockNotificationStore({
      setState: storeMocks.notificationInit,
      reset: storeMocks.resetNotificationStore,
    }),
  );
  // Settings sync is now handled in the controller (hydrateMeImAlive)
  vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);
  vi.spyOn(NotificationNormalizer, 'toEnabledTypes').mockReturnValue(MOCK_ALLOWED_TYPES);
  return authStore;
};

// Mock pubky-app-specs to avoid WebAssembly issues
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/database/franky/franky.helpers', () => ({
  clearDatabase: vi.fn(),
}));

const mockClearDatabase = vi.mocked(clearDatabase);

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

  // Factories are kept as separate constants so they can be reapplied in
  // beforeEach — vitest 4.1's restoreAllMocks() can clear vi.fn implementations
  // when a property has been spied on, so we need to re-establish defaults.
  const authStateFactory = () => ({
    init: initAuthStore,
    setSession: vi.fn(),
    setCurrentUserPubky: vi.fn(),
    setHasProfile: vi.fn(),
    setIsRestoringSession: vi.fn(),
    setHasHydrated: vi.fn(),
    reset: resetAuthStore,
    selectCurrentUserPubky: vi.fn(() => TEST_PUBKY),
    selectIsAuthenticated: vi.fn(() => false),
  });
  const onboardingStateFactory = () => ({ reset: resetOnboardingStore });
  const notificationStateFactory = () => ({
    setState: notificationInit,
    reset: resetNotificationStore,
  });
  const signInStateFactory = () => ({
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
  });
  const localFilesStateFactory = () => ({ reset: resetLocalFilesStore });
  const homeStateFactory = () => ({ reset: resetHomeStore });
  const hotStateFactory = () => ({ reset: resetHotStore });
  const searchStateFactory = () => ({ reset: resetSearchStore });
  const settingsStateFactory = () => ({ reset: resetSettingsStore });

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
    authStateFactory,
    onboardingStateFactory,
    notificationStateFactory,
    signInStateFactory,
    localFilesStateFactory,
    homeStateFactory,
    hotStateFactory,
    searchStateFactory,
    settingsStateFactory,
    getAuthState: vi.fn(authStateFactory),
    getOnboardingState: vi.fn(onboardingStateFactory),
    getNotificationState: vi.fn(notificationStateFactory),
    getSignInState: vi.fn(signInStateFactory),
    getLocalFilesState: vi.fn(localFilesStateFactory),
    getHomeState: vi.fn(homeStateFactory),
    getHotState: vi.fn(hotStateFactory),
    getSearchState: vi.fn(searchStateFactory),
    getSettingsState: vi.fn(settingsStateFactory),
  };
});

// Mock stores - simplified approach
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: storeMocks.getAuthState,
  },
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: {
    getState: storeMocks.getOnboardingState,
  },
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: {
    getState: storeMocks.getNotificationState,
  },
}));
vi.mock('@/stores/signIn/signIn.store', () => ({
  useSignInStore: {
    getState: storeMocks.getSignInState,
  },
}));
vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: {
    getState: storeMocks.getLocalFilesState,
  },
}));
vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: {
    getState: storeMocks.getHomeState,
  },
}));
vi.mock('@/stores/hot/hot.store', () => ({
  useHotStore: {
    getState: storeMocks.getHotState,
  },
}));
vi.mock('@/stores/search/search.store', () => ({
  useSearchStore: {
    getState: storeMocks.getSearchState,
  },
}));
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: {
    getState: storeMocks.getSettingsState,
  },
}));
vi.mock('@/stores/migration/migration.store', () => ({
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

vi.mock('@/libs/env/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/env/env')>();
  return {
    Env: {
      ...actual.Env,
      HOMESERVER_ADMIN_URL: 'http://test-admin.com',
      HOMESERVER_ADMIN_PASSWORD: 'test-password',
    },
  };
});

describe('AuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClearDatabase.mockReset();
    // Re-apply factory implementations: vi.restoreAllMocks() in afterEach can
    // clear vi.fn implementations whenever a property has been spied on, which
    // would leave subsequent tests with empty mocks returning undefined.
    storeMocks.getAuthState.mockImplementation(storeMocks.authStateFactory);
    storeMocks.getOnboardingState.mockImplementation(storeMocks.onboardingStateFactory);
    storeMocks.getNotificationState.mockImplementation(storeMocks.notificationStateFactory);
    storeMocks.getSignInState.mockImplementation(storeMocks.signInStateFactory);
    storeMocks.getLocalFilesState.mockImplementation(storeMocks.localFilesStateFactory);
    storeMocks.getHomeState.mockImplementation(storeMocks.homeStateFactory);
    storeMocks.getHotState.mockImplementation(storeMocks.hotStateFactory);
    storeMocks.getSearchState.mockImplementation(storeMocks.searchStateFactory);
    storeMocks.getSettingsState.mockImplementation(storeMocks.settingsStateFactory);
    // Ensure migration store mock is always available
    vi.spyOn(useMigrationStore, 'getState').mockReturnValue(
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
      const notification: NotificationState = { unread: 2, lastRead: 123, lastPolledTimestamp: undefined };
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);
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
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStoreState);

      await AuthController.bootstrapWithDelay();

      expect(sleepSpy).toHaveBeenCalledWith(5000);
      expect(initializeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pubky: TEST_PUBKY,
          lastReadUrl: getLastReadUrl(TEST_PUBKY),
          allowedTypes: MOCK_ALLOWED_TYPES,
        }),
        expect.any(Function), // onProgress callback
      );
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(notification);
      expect(authStoreState.setHasProfile).toHaveBeenCalledWith(true);
    });

    it('should use remote settings when initializeSettings returns non-null', async () => {
      // Goal: prove that bootstrap prefers fresher remote settings and derives
      // notification bootstrap inputs from that remote snapshot.
      const remoteNotificationPrefs: NotificationPreferences = {
        newFriend: true,
        tagProfile: true,
        mention: true,
        reply: true,
        postDeleted: true,
        follow: false,
        tagPost: false,
        repost: false,
        postEdited: false,
      };
      const remoteSettings = createMockSettingsState({
        notifications: remoteNotificationPrefs,
        language: 'fr',
      });
      const remoteAllowedTypes = [NotificationType.Reply, NotificationType.Mention];

      // Override global mocks: initializeSettings returns remote, toEnabledTypes uses remote prefs
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(remoteSettings);
      vi.spyOn(NotificationNormalizer, 'toEnabledTypes').mockReturnValue(remoteAllowedTypes);
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(createMockSettingsState());

      const notification: NotificationState = { unread: 5, lastRead: 999, lastPolledTimestamp: undefined };
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);
      await spyOnSleep();

      const loadFromHomeserverSpy = vi.fn();
      const setLocaleCookieSpy = vi.spyOn(i18nUtils, 'setLocaleCookie').mockImplementation(() => {});
      const settingsStoreState = mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy });
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(settingsStoreState);

      const authStoreState = mockAuthStore({
        ...storeMocks.getAuthState(),
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY),
        setHasProfile: vi.fn(),
      });
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStoreState);

      await AuthController.bootstrapWithDelay();

      // toEnabledTypes should have been called with remote notification preferences
      expect(NotificationNormalizer.toEnabledTypes).toHaveBeenCalledWith(remoteNotificationPrefs);
      // Bootstrap should use remote-derived allowedTypes
      expect(initializeSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ allowedTypes: remoteAllowedTypes }));
      // Remote settings should be applied to the store and locale cookie
      expect(loadFromHomeserverSpy).toHaveBeenCalledWith(remoteSettings);
      expect(setLocaleCookieSpy).toHaveBeenCalledWith('fr');
    });

    it('should complete bootstrap when settings sync fails with AppError', async () => {
      // Goal: prove that settings sync failures are non-blocking and bootstrap
      // still finishes with local settings as the fallback source of truth.
      const appError = new AppError({
        category: ErrorCategory.Server,
        code: ServerErrorCode.UNKNOWN_ERROR,
        message: 'settings sync failed',
        service: ErrorService.Homeserver,
        operation: 'initializeSettings',
      });
      vi.spyOn(SettingsApplication, 'initializeSettings').mockRejectedValue(appError);
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(createMockSettingsState());

      const notification: NotificationState = { unread: 0, lastRead: 0, lastPolledTimestamp: undefined };
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);
      await spyOnSleep();
      const setLocaleCookieSpy = vi.spyOn(i18nUtils, 'setLocaleCookie').mockImplementation(() => {});

      const loadFromHomeserverSpy = vi.fn();
      const settingsStoreState = mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy });
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(settingsStoreState);

      const authStoreState = mockAuthStore({
        ...storeMocks.getAuthState(),
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY),
        setHasProfile: vi.fn(),
      });
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStoreState);

      await AuthController.bootstrapWithDelay();

      // Bootstrap should still complete despite settings sync failure
      expect(initializeSpy).toHaveBeenCalled();
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(notification);
      expect(authStoreState.setHasProfile).toHaveBeenCalledWith(true);
      // Remote settings should NOT be applied (sync failed, fell back to local)
      expect(loadFromHomeserverSpy).not.toHaveBeenCalled();
      expect(setLocaleCookieSpy).not.toHaveBeenCalled();
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
      const mockPubky = 'test-pubky' as Pubky;

      const signUpSpy = vi.spyOn(AuthApplication, 'signUp').mockResolvedValue({
        session: mockSession,
      });
      const keypairFromSecretKeySpy = vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(keypair);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();

      const authStore = storeMocks.getAuthState();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));

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

      const signUpSpy = vi.spyOn(AuthApplication, 'signUp').mockRejectedValue(new Error('Signup failed'));
      const keypairFromSecretKeySpy = vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(keypair);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
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
      vi.spyOn(NotificationNormalizer, 'to').mockReturnValue(
        asOpaque<LastReadResult>({
          meta: { url: 'pubky://test-pubky/pub/pubky.app/last_read' },
        }),
      );
    });

    it('should successfully login with mnemonic and bootstrap', async () => {
      const mnemonic = 'test mnemonic phrase';
      const mockKeypair = createMockKeypair();
      const mockSession = buildMockSession();
      const mockPubky = 'test-pubky' as Pubky;
      const mockData = { session: mockSession };
      const mockNotification: NotificationState = { unread: 0, lastRead: 123, lastPolledTimestamp: 0 };

      const keypairSpy = vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      const signInSpy = vi.spyOn(AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(mockNotification);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
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
          allowedTypes: MOCK_ALLOWED_TYPES,
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
      const mockPubky = 'test-pubky' as Pubky;
      const mockData = { session: mockSession };

      const keypairSpy = vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      const signInSpy = vi.spyOn(AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize');
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
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
      vi.spyOn(AuthApplication, 'signIn').mockResolvedValue(undefined);
      mockClearDatabase.mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize');

      const result = await AuthController.loginWithMnemonic({ mnemonic });

      expect(initializeSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should throw error if signIn fails', async () => {
      const mnemonic = 'test mnemonic phrase';
      const mockKeypair = createMockKeypair();

      vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(mockKeypair);
      vi.spyOn(AuthApplication, 'signIn').mockRejectedValue(new Error('Authentication failed'));
      mockClearDatabase.mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      await expect(AuthController.loginWithMnemonic({ mnemonic })).rejects.toThrow('Authentication failed');
    });
  });

  describe('loginWithEncryptedFile', () => {
    beforeEach(() => {
      setupOnboardingStore();
      vi.spyOn(NotificationNormalizer, 'to').mockReturnValue(
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
      const mockPubky = 'test-pubky' as Pubky;
      const mockData = { session: mockSession };
      const mockNotification: NotificationState = { unread: 0, lastRead: 123, lastPolledTimestamp: 0 };

      const decryptSpy = vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(mockKeypair);
      const signInSpy = vi.spyOn(AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(mockNotification);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
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
          allowedTypes: MOCK_ALLOWED_TYPES,
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
      const mockPubky = 'test-pubky' as Pubky;
      const mockData = { session: mockSession };

      const decryptSpy = vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(mockKeypair);
      const signInSpy = vi.spyOn(AuthApplication, 'signIn').mockResolvedValue(mockData);
      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize');
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
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
      vi.spyOn(AuthApplication, 'signIn').mockResolvedValue(undefined);
      mockClearDatabase.mockResolvedValue(undefined);
      await spyOnClearAllQueryClients();

      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize');

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
      vi.spyOn(AuthApplication, 'signIn').mockRejectedValue(new Error('Authentication failed'));
      mockClearDatabase.mockResolvedValue(undefined);
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
      const generateAuthUrlSpy = vi.spyOn(AuthApplication, 'generateAuthUrl').mockResolvedValue(mockAuthUrl);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);

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
        .spyOn(AuthApplication, 'generateAuthUrl')
        .mockRejectedValue(new Error('Failed to generate auth URL'));
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);

      await expect(AuthController.getAuthUrl()).rejects.toThrow('Failed to generate auth URL');
      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(generateAuthUrlSpy).toHaveBeenCalled();
    });

    it('should free stale auth flows when multiple requests overlap (StrictMode)', async () => {
      mockClearDatabase.mockResolvedValue(undefined);

      const cancelAuthFlowA = vi.fn();
      const cancelAuthFlowB = vi.fn();

      type GenerateAuthUrlResult = Awaited<ReturnType<typeof AuthApplication.generateAuthUrl>>;

      let resolveFirst!: (value: GenerateAuthUrlResult) => void;
      const first = new Promise<GenerateAuthUrlResult>((resolve) => {
        resolveFirst = resolve;
      });

      vi.spyOn(AuthApplication, 'generateAuthUrl')
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
        .spyOn(AuthApplication, 'generateSignupAuthUrl')
        .mockResolvedValue(mockAuthUrl);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);

      const result = await AuthController.getSignupAuthUrl('A9KM-7MJP-ERM9');

      expect(clearDatabaseSpy).toHaveBeenCalled();
      expect(generateSignupAuthUrlSpy).toHaveBeenCalledWith('A9KM-7MJP-ERM9');
      expect(result.authorizationUrl).toEqual(mockAuthUrl.authorizationUrl);
      expect(result.awaitApproval).toBeInstanceOf(Promise);
      expect(result.cancelAuthFlow).toBe(cancelAuthFlow);
    });

    it('should throw error when signup auth URL generation fails', async () => {
      const generateSignupAuthUrlSpy = vi
        .spyOn(AuthApplication, 'generateSignupAuthUrl')
        .mockRejectedValue(new Error('Failed to generate signup auth URL'));
      mockClearDatabase.mockResolvedValue(undefined);

      await expect(AuthController.getSignupAuthUrl('INVITE-CODE')).rejects.toThrow(
        'Failed to generate signup auth URL',
      );
      expect(generateSignupAuthUrlSpy).toHaveBeenCalledWith('INVITE-CODE');
    });

    it('should free stale auth flows when multiple requests overlap (StrictMode)', async () => {
      mockClearDatabase.mockResolvedValue(undefined);

      const cancelAuthFlowA = vi.fn();
      const cancelAuthFlowB = vi.fn();

      type GenerateSignupAuthUrlResult = Awaited<ReturnType<typeof AuthApplication.generateSignupAuthUrl>>;

      let resolveFirst!: (value: GenerateSignupAuthUrlResult) => void;
      const first = new Promise<GenerateSignupAuthUrlResult>((resolve) => {
        resolveFirst = resolve;
      });

      vi.spyOn(AuthApplication, 'generateSignupAuthUrl')
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
      const mockPubky = TEST_PUBKY as Pubky;

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

      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ session: mockSession });
      vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);

      const result = await AuthController.restorePersistedSession();

      expect(result).toBe(true);
      expect(AuthApplication.restorePersistedSession).toHaveBeenCalledWith({ authStore });
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

      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue(null);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      const resetSpy = vi.spyOn(PubkySpecsSingleton, 'reset');
      const homeStore = storeMocks.getHomeState();
      const searchStore = storeMocks.getSearchState();
      const notificationStore = storeMocks.getNotificationState();
      const settingsStore = storeMocks.getSettingsState();
      // Partial mocks: only mock the methods under test, cast via `unknown` to satisfy the full store type
      vi.spyOn(useHomeStore, 'getState').mockReturnValue(mockHomeStore(homeStore));
      vi.spyOn(useSearchStore, 'getState').mockReturnValue(mockSearchStore(searchStore));
      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(mockNotificationStore(notificationStore));
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(settingsStore));

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
      vi.spyOn(AuthApplication, 'generateAuthUrl').mockResolvedValue({
        authorizationUrl: 'https://example.com/auth?token=abc123',
        awaitApproval: new Promise(() => {}),
        cancelAuthFlow,
      });
      mockClearDatabase.mockResolvedValue(undefined);

      await AuthController.getAuthUrl();

      const mockSession = buildMockSession();
      vi.spyOn(Identity, 'z32FromSession').mockReturnValue(TEST_PUBKY as Pubky);
      vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const authStore = storeMocks.getAuthState();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));

      await AuthController.initializeAuthenticatedSession({ session: mockSession });

      expect(cancelAuthFlow).toHaveBeenCalled();
    });

    it('should initialize session and bootstrap if user is signed up', async () => {
      const mockSession = buildMockSession();
      const mockPubky = TEST_PUBKY as Pubky;
      const notification: NotificationState = { unread: 0, lastRead: 456, lastPolledTimestamp: 0 };

      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);

      const authStore = storeMocks.getAuthState();
      const signInStore = storeMocks.getSignInState();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
      vi.spyOn(useSignInStore, 'getState').mockReturnValue(mockSignInStore(signInStore));

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
          allowedTypes: MOCK_ALLOWED_TYPES,
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
      const mockPubky = TEST_PUBKY as Pubky;

      const z32FromSessionSpy = vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      const userIsSignedUpSpy = vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize');

      const authStore = storeMocks.getAuthState();
      const signInStore = storeMocks.getSignInState();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
      vi.spyOn(useSignInStore, 'getState').mockReturnValue(mockSignInStore(signInStore));

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

    it('should use remote settings for allowedTypes and apply them to store when initializeSettings returns non-null', async () => {
      // Goal: prove that, during session initialization, fresher remote settings
      // drive allowedTypes computation and are applied to settings state/cookie.
      const mockSession = buildMockSession();
      const mockPubky = TEST_PUBKY as Pubky;
      const remoteNotificationPrefs: NotificationPreferences = {
        newFriend: true,
        mention: true,
        reply: true,
        follow: false,
        tagPost: false,
        tagProfile: false,
        repost: false,
        postDeleted: false,
        postEdited: false,
      };
      const remoteSettings = createMockSettingsState({
        notifications: remoteNotificationPrefs,
        language: 'fr',
      });
      const remoteAllowedTypes = [NotificationType.Reply, NotificationType.Mention];
      const notification: NotificationState = { unread: 3, lastRead: 789, lastPolledTimestamp: 0 };

      vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(remoteSettings);
      vi.spyOn(NotificationNormalizer, 'toEnabledTypes').mockReturnValue(remoteAllowedTypes);
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(createMockSettingsState());
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);

      const loadFromHomeserverSpy = vi.fn();
      const setLocaleCookieSpy = vi.spyOn(i18nUtils, 'setLocaleCookie').mockImplementation(() => {});
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(
        mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy }),
      );

      const authStore = storeMocks.getAuthState();
      const signInStore = storeMocks.getSignInState();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
      vi.spyOn(useSignInStore, 'getState').mockReturnValue(mockSignInStore(signInStore));

      await AuthController.initializeAuthenticatedSession({ session: mockSession });

      // toEnabledTypes should receive remote notification preferences
      expect(NotificationNormalizer.toEnabledTypes).toHaveBeenCalledWith(remoteNotificationPrefs);
      // Bootstrap should use remote-derived allowedTypes
      expect(initializeSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ allowedTypes: remoteAllowedTypes }));
      // Remote settings applied to store and locale cookie
      expect(loadFromHomeserverSpy).toHaveBeenCalledWith(remoteSettings);
      expect(setLocaleCookieSpy).toHaveBeenCalledWith('fr');
    });

    it('should complete bootstrap when settings sync fails with AppError', async () => {
      // Goal: prove that settings-sync failures do not block authenticated-session
      // bootstrap and that local settings are used as the fallback source.
      const mockSession = buildMockSession();
      const mockPubky = TEST_PUBKY as Pubky;
      const localSettings = createMockSettingsState();

      vi.spyOn(Identity, 'z32FromSession').mockReturnValue(mockPubky);
      vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
      vi.spyOn(SettingsApplication, 'initializeSettings').mockRejectedValue(
        new AppError({
          category: ErrorCategory.Server,
          code: ServerErrorCode.UNKNOWN_ERROR,
          message: 'homeserver unreachable',
          service: ErrorService.Homeserver,
          operation: 'initializeSettings',
        }),
      );
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(localSettings);

      const notification: NotificationState = { unread: 0, lastRead: 0, lastPolledTimestamp: 0 };
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);
      const setLocaleCookieSpy = vi.spyOn(i18nUtils, 'setLocaleCookie').mockImplementation(() => {});

      const loadFromHomeserverSpy = vi.fn();
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(
        mockSettingsStore({ loadFromHomeserver: loadFromHomeserverSpy }),
      );

      const authStore = storeMocks.getAuthState();
      const signInStore = storeMocks.getSignInState();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore(authStore));
      vi.spyOn(useSignInStore, 'getState').mockReturnValue(mockSignInStore(signInStore));

      await AuthController.initializeAuthenticatedSession({ session: mockSession });

      // Bootstrap should still complete
      expect(initializeSpy).toHaveBeenCalled();
      expect(storeMocks.notificationInit).toHaveBeenCalledWith(notification);
      // toEnabledTypes should use local preferences (fallback)
      expect(NotificationNormalizer.toEnabledTypes).toHaveBeenCalledWith(localSettings.notifications);
      // Remote settings should NOT be applied
      expect(loadFromHomeserverSpy).not.toHaveBeenCalled();
      expect(setLocaleCookieSpy).not.toHaveBeenCalled();
      // Session flow completes normally
      expect(authStore.setHasProfile).toHaveBeenCalledWith(true);
    });
  });

  describe('logout', () => {
    const createAuthStore = (overrides: Partial<AuthStore> = {}): AuthStore =>
      mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: 'test-pubky' as Pubky,
        session: buildMockSession(),
        hasProfile: false,
        hasHydrated: false,
        sessionExport: null,
        isRestoringSession: false,
        isLoggingOut: false,
        selectCurrentUserPubky: vi.fn(() => 'test-pubky' as Pubky),
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
      const logoutSpy = vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      const clearAllQueryClientsSpy = await spyOnClearAllQueryClients();
      const resetSpy = vi.spyOn(PubkySpecsSingleton, 'reset');
      const resetTtlSpy = vi.spyOn(TtlCoordinator, 'resetInstance');
      const resetStreamSpy = vi.spyOn(StreamCoordinator, 'resetInstance');
      const resetNotifCoordSpy = vi.spyOn(NotificationCoordinator, 'resetInstance');
      const postStreamQueueClearSpy = vi.spyOn(postStreamQueue, 'clear');

      const signInStore = createSignInStore();
      const localFilesStore = createLocalFilesStore();
      const homeStore = storeMocks.getHomeState();
      const hotStore = storeMocks.getHotState();
      const searchStore = storeMocks.getSearchState();
      const notificationStore = storeMocks.getNotificationState();
      const settingsStore = storeMocks.getSettingsState();
      const authStore = createAuthStore();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(useSignInStore, 'getState').mockReturnValue(signInStore);
      vi.spyOn(useLocalFilesStore, 'getState').mockReturnValue(localFilesStore);
      // Partial mocks: only mock the methods under test, cast via `unknown` to satisfy the full store type
      vi.spyOn(useHomeStore, 'getState').mockReturnValue(mockHomeStore(homeStore));
      vi.spyOn(useHotStore, 'getState').mockReturnValue(mockHotStore(hotStore));
      vi.spyOn(useSearchStore, 'getState').mockReturnValue(mockSearchStore(searchStore));
      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(mockNotificationStore(notificationStore));
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(settingsStore));

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
      expect(authStore.reset).toHaveBeenCalledOnce();
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
      const logoutSpy = vi.spyOn(AuthApplication, 'logout').mockRejectedValue(new Error('Network error'));
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      const localFilesStore = createLocalFilesStore();
      const authStore = createAuthStore();
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(useLocalFilesStore, 'getState').mockReturnValue(localFilesStore);

      await AuthController.logout();
      expect(logoutSpy).toHaveBeenCalledWith({ session: expect.anything() });
      expect(warnSpy).toHaveBeenCalledWith('Homeserver logout failed, clearing local state anyway', {
        error: expect.any(Error),
      });
      // Local state should still be cleared even if homeserver logout fails
      expect(storeMocks.resetOnboardingStore).toHaveBeenCalled();
      expect(authStore.reset).toHaveBeenCalled();
      expect(localFilesStore.reset).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });

    it('should restore a persisted session before homeserver logout when only sessionExport exists', async () => {
      const restoredSession = buildMockSession({
        export: vi.fn(() => 'restored-export'),
      });
      const logoutSpy = vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
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

      vi.spyOn(useAuthStore, 'getState').mockImplementation(() => authStore);
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(useSignInStore, 'getState').mockReturnValue(createSignInStore());
      vi.spyOn(useLocalFilesStore, 'getState').mockReturnValue(localFilesStore);
      vi.spyOn(useHomeStore, 'getState').mockReturnValue(mockHomeStore(homeStore));
      vi.spyOn(useHotStore, 'getState').mockReturnValue(mockHotStore(hotStore));
      vi.spyOn(useSearchStore, 'getState').mockReturnValue(mockSearchStore(searchStore));
      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(mockNotificationStore(notificationStore));
      vi.spyOn(useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(settingsStore));

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
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      const logoutSpy = vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);

      const authStore = createAuthStore({
        session: null,
        sessionExport: 'session-export',
      });

      vi.spyOn(useAuthStore, 'getState').mockImplementation(() => authStore);
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());
      vi.spyOn(AuthController, 'restorePersistedSession').mockResolvedValue(false);

      await AuthController.logout();

      expect(logoutSpy).not.toHaveBeenCalled();
      expect(clearCookiesSpy).not.toHaveBeenCalled();
      expect(clearDatabaseSpy).not.toHaveBeenCalled();
    });

    it('should reset PubkySpecsSingleton even when homeserver logout fails (issue #538)', async () => {
      vi.spyOn(AuthApplication, 'logout').mockRejectedValue(new Error('Pubky resolution failed'));
      mockClearDatabase.mockResolvedValue(undefined);
      await spyOnClearCookies();
      await spyOnClearAllQueryClients();
      vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      const resetSpy = vi.spyOn(PubkySpecsSingleton, 'reset');

      vi.spyOn(useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());

      await AuthController.logout();

      // PubkySpecsSingleton should be reset even when homeserver logout fails
      // This ensures users can sign out even when their profile pubky cannot be resolved
      expect(resetSpy).toHaveBeenCalledOnce();
    });

    it('should clear all existing cookies', async () => {
      const logoutSpy = vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = mockClearDatabase.mockResolvedValue(undefined);
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();

      vi.spyOn(useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());

      document.cookie = 'session=abc123; path=/';
      document.cookie = 'token=xyz789; path=/';
      document.cookie = 'user=john; path=/';

      await AuthController.logout();

      expect(logoutSpy).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw error if clearing the database fails', async () => {
      const logoutSpy = vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
      const clearDatabaseSpy = mockClearDatabase.mockRejectedValue(new Error('clear failed'));
      const clearCookiesSpy = await spyOnClearCookies();
      await spyOnClearAllQueryClients();

      vi.spyOn(useAuthStore, 'getState').mockReturnValue(createAuthStore());
      vi.spyOn(useOnboardingStore, 'getState').mockReturnValue(createOnboardingStore());

      await expect(AuthController.logout()).rejects.toThrow('clear failed');
      expect(logoutSpy).toHaveBeenCalled();
      expect(clearCookiesSpy).toHaveBeenCalled();
      expect(clearDatabaseSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateSignupToken', () => {
    it('should generate signup token successfully', async () => {
      const generateSignupTokenSpy = vi.spyOn(AuthApplication, 'generateSignupToken').mockResolvedValue('test-token');
      const result = await AuthController.generateSignupToken();
      expect(result).toBe('test-token');
      expect(generateSignupTokenSpy).toHaveBeenCalled();
    });
  });
});
