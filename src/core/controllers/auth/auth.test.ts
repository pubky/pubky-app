import { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { SettingsApplication } from '@/application/settings/settings';
import { UserApplication } from '@/application/user/user';
import { LOCKS_CAPABILITIES } from '@/config/auth';
import { getModerationId } from '@/config/moderation';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import type { NotificationState } from '@/stores/notification/notification.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type NotificationPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { mockSession as buildMockSession } from '@/test-utils/pubky';
import { mockAuthStore, mockMigrationStore, mockNotificationStore, mockSettingsStore } from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

vi.mock('@/config/moderation', () => ({ getModerationId: vi.fn() }));

const getModerationIdMock = vi.mocked(getModerationId);

const TEST_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const MODERATION_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const MOCK_ALLOWED_TYPES = [NotificationType.Follow, NotificationType.Reply];

const spyOnSleep = async () => vi.spyOn(await import('@/libs/utils/utils'), 'sleep').mockResolvedValue(undefined);
const getLastReadUrl = (pubky: string) => `pubky://${pubky}/pub/pubky.app/last_read`;

const createMockSettingsState = (overrides?: Partial<SettingsState>): SettingsState => ({
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  muted: [],
  updatedAt: 0,
  version: 1,
  ...overrides,
});

const createMutableSettingsStore = (moderationBot?: Pubky) => {
  let state = createMockSettingsState({
    privacy: { ...defaultPrivacyPreferences, ...(moderationBot !== undefined ? { moderationBot } : {}) },
  });
  const setModerationBot = vi.fn((value: Pubky) => {
    state = {
      ...state,
      privacy: { ...state.privacy, moderationBot: value },
      updatedAt: state.updatedAt + 1,
    };
  });
  const loadFromHomeserver = vi.fn((settings: SettingsState) => {
    state = settings;
  });

  return {
    getState: () => mockSettingsStore({ ...state, setModerationBot, loadFromHomeserver, reset: vi.fn() }),
    getSnapshot: () => state,
    setModerationBot,
    loadFromHomeserver,
  };
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
    authUrlResolved: false,
    profileChecked: false,
    bootstrapFetched: false,
    dataPersisted: false,
    homeserverSynced: false,
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
vi.mock('@synonymdev/pubky', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@synonymdev/pubky')>()),
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

afterEach(() => {
  AuthController.cancelModerationFollow();
  vi.restoreAllMocks();
});

describe('AuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModerationIdMock.mockReset().mockReturnValue(undefined);
    vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(undefined);
    mockClearDatabase.mockReset();
    // Default: homeserver environment check passes (non-staging test config / allowed key)
    vi.spyOn(AuthApplication, 'assertUserHomeserverAllowed').mockResolvedValue(undefined);
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

  describe('hasCapabilities', () => {
    it.each([
      { capabilities: ['/:rw'], expected: true },
      { capabilities: ['/pub/pubky.app/:rw'], expected: false },
      { capabilities: [...LOCKS_CAPABILITIES], expected: true },
    ])('checks actual session permissions: $capabilities', ({ capabilities, expected }) => {
      const session = buildMockSession({ info: asOpaque({ capabilities }) });
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore({ session, selectSession: () => session }));
      expect(AuthController.hasCapabilities(LOCKS_CAPABILITIES)).toBe(expected);
    });

    it('requires a live session', () => {
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore({ session: null, selectSession: () => null }));
      expect(AuthController.hasCapabilities(LOCKS_CAPABILITIES)).toBe(false);
    });
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
        privacy: { ...defaultPrivacyPreferences, moderationBot: MODERATION_PUBKY },
      });
      const remoteAllowedTypes = [NotificationType.Reply, NotificationType.Mention];

      // Override global mocks: initializeSettings returns remote, toEnabledTypes uses remote prefs
      vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(remoteSettings);
      vi.spyOn(NotificationNormalizer, 'toEnabledTypes').mockReturnValue(remoteAllowedTypes);
      vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(createMockSettingsState());

      const notification: NotificationState = { unread: 5, lastRead: 999, lastPolledTimestamp: undefined };
      const initializeSpy = vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notification);
      await spyOnSleep();

      const settingsStore = createMutableSettingsStore();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);

      const authStoreState = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY),
        setHasProfile: vi.fn(),
      });
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStoreState);

      await AuthController.bootstrapWithDelay();

      // toEnabledTypes should have been called with remote notification preferences
      expect(NotificationNormalizer.toEnabledTypes).toHaveBeenCalledWith(remoteNotificationPrefs);
      // Bootstrap should use remote-derived allowedTypes
      expect(initializeSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ allowedTypes: remoteAllowedTypes }));
      // Remote settings should be applied to the store
      expect(settingsStore.loadFromHomeserver).toHaveBeenCalledWith(remoteSettings);
      // Moderation follow reads the processed state from the freshly loaded remote settings
      expect(UserApplication.ensureModerationFollow).toHaveBeenCalledWith(
        expect.objectContaining({ moderationBot: MODERATION_PUBKY }),
      );
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
      expect(UserApplication.ensureModerationFollow).not.toHaveBeenCalled();
    });

    it('should start moderation follow after bootstrap and keep it off the critical path', async () => {
      let resolveBootstrap!: (notification: NotificationState) => void;
      const bootstrapPending = new Promise<NotificationState>((resolve) => {
        resolveBootstrap = resolve;
      });
      const settingsStore = createMutableSettingsStore();
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY as Pubky),
        setHasProfile: vi.fn(),
      });
      await spyOnSleep();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(BootstrapApplication, 'initialize').mockReturnValue(bootstrapPending);
      getModerationIdMock.mockReturnValue(MODERATION_PUBKY);
      const ensureModerationFollow = vi
        .spyOn(UserApplication, 'ensureModerationFollow')
        .mockImplementation(
          ({ signal }) =>
            new Promise<undefined>((resolve) =>
              signal?.addEventListener('abort', () => resolve(undefined), { once: true }),
            ),
        );

      const bootstrap = AuthController.bootstrapWithDelay();

      await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());
      expect(ensureModerationFollow).not.toHaveBeenCalled();

      resolveBootstrap({ unread: 0, lastRead: 0, lastPolledTimestamp: undefined });
      await expect(bootstrap).resolves.toBeUndefined();

      expect(ensureModerationFollow).toHaveBeenCalledWith({
        follower: TEST_PUBKY,
        moderationId: MODERATION_PUBKY,
        moderationBot: undefined,
        signal: expect.any(AbortSignal),
      });
    });

    it('should persist processed moderation state through the shared settings writer', async () => {
      const settingsStore = createMutableSettingsStore();
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY as Pubky),
        setHasProfile: vi.fn(),
      });
      await spyOnSleep();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
        unread: 0,
        lastRead: 0,
        lastPolledTimestamp: undefined,
      });
      getModerationIdMock.mockReturnValue(MODERATION_PUBKY);
      vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(MODERATION_PUBKY);
      const commitUpdate = vi.spyOn(SettingsApplication, 'commitUpdate').mockResolvedValue(undefined);

      await AuthController.bootstrapWithDelay();

      await vi.waitFor(() => expect(commitUpdate).toHaveBeenCalledOnce());
      expect(settingsStore.setModerationBot).toHaveBeenCalledWith(MODERATION_PUBKY);
      expect(settingsStore.getSnapshot().privacy.moderationBot).toBe(MODERATION_PUBKY);
      expect(commitUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ privacy: expect.objectContaining({ moderationBot: MODERATION_PUBKY }) }),
        TEST_PUBKY,
        expect.any(AbortSignal),
      );
    });

    it('should not record processed state when the signed-in account changed while the follow was in flight', async () => {
      let resolveFollow!: (moderationId: Pubky) => void;
      const followPending = new Promise<Pubky>((resolve) => {
        resolveFollow = resolve;
      });
      const settingsStore = createMutableSettingsStore();
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY as Pubky),
        setHasProfile: vi.fn(),
      });
      await spyOnSleep();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);
      const getAuthState = vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
        unread: 0,
        lastRead: 0,
        lastPolledTimestamp: undefined,
      });
      getModerationIdMock.mockReturnValue(MODERATION_PUBKY);
      const ensureModerationFollow = vi.spyOn(UserApplication, 'ensureModerationFollow').mockReturnValue(followPending);
      const commitUpdate = vi.spyOn(SettingsApplication, 'commitUpdate').mockResolvedValue(undefined);

      await AuthController.bootstrapWithDelay();
      getAuthState.mockReturnValue(mockAuthStore({ ...authStore, currentUserPubky: MODERATION_PUBKY }));
      resolveFollow(MODERATION_PUBKY);
      await vi.waitFor(() => expect(ensureModerationFollow).toHaveBeenCalledOnce());
      // Let the detached continuation run past its guard before asserting nothing was written
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settingsStore.setModerationBot).not.toHaveBeenCalled();
      expect(settingsStore.getSnapshot().privacy.moderationBot).toBeUndefined();
      expect(commitUpdate).not.toHaveBeenCalled();
    });

    it('should cancel older detached moderation work when a new bootstrap starts', async () => {
      const settingsStore = createMutableSettingsStore();
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY as Pubky),
        setHasProfile: vi.fn(),
      });
      const signals: AbortSignal[] = [];
      await spyOnSleep();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
        unread: 0,
        lastRead: 0,
        lastPolledTimestamp: undefined,
      });
      getModerationIdMock.mockReturnValue(MODERATION_PUBKY);
      vi.spyOn(UserApplication, 'ensureModerationFollow').mockImplementation(({ signal }) => {
        if (signal) signals.push(signal);
        return signals.length === 1
          ? new Promise<undefined>((resolve) =>
              signal?.addEventListener('abort', () => resolve(undefined), { once: true }),
            )
          : Promise.resolve(undefined);
      });

      await AuthController.bootstrapWithDelay();
      await AuthController.bootstrapWithDelay();

      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
    });

    it('should keep a settings persistence failure non-blocking and report only the raw failure', async () => {
      const settingsStore = createMutableSettingsStore();
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY as Pubky),
        setHasProfile: vi.fn(),
      });
      const failure = new Error('settings write failed');
      await spyOnSleep();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
        unread: 0,
        lastRead: 0,
        lastPolledTimestamp: undefined,
      });
      getModerationIdMock.mockReturnValue(MODERATION_PUBKY);
      vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(MODERATION_PUBKY);
      vi.spyOn(SettingsApplication, 'commitUpdate').mockRejectedValue(failure);
      const loggerWarn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await expect(AuthController.bootstrapWithDelay()).resolves.toBeUndefined();

      await vi.waitFor(() =>
        expect(loggerWarn).toHaveBeenCalledWith('Unexpected moderation-follow authentication failure', {
          error: failure,
        }),
      );
    });

    it('should not re-log an AppError from detached moderation work', async () => {
      const settingsStore = createMutableSettingsStore();
      const authStore = mockAuthStore({
        ...storeMocks.getAuthState(),
        currentUserPubky: TEST_PUBKY as Pubky,
        selectCurrentUserPubky: vi.fn(() => TEST_PUBKY as Pubky),
        setHasProfile: vi.fn(),
      });
      const failure = Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Homeserver unavailable', {
        service: ErrorService.Homeserver,
        operation: 'ensureModerationFollow',
      });
      await spyOnSleep();
      vi.spyOn(useSettingsStore, 'getState').mockImplementation(settingsStore.getState);
      vi.spyOn(useAuthStore, 'getState').mockReturnValue(authStore);
      vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
        unread: 0,
        lastRead: 0,
        lastPolledTimestamp: undefined,
      });
      getModerationIdMock.mockReturnValue(MODERATION_PUBKY);
      vi.spyOn(UserApplication, 'ensureModerationFollow').mockRejectedValue(failure);
      const loggerWarn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await expect(AuthController.bootstrapWithDelay()).resolves.toBeUndefined();
      await vi.waitFor(() => expect(UserApplication.ensureModerationFollow).toHaveBeenCalledOnce());
      await Promise.resolve();

      expect(loggerWarn).not.toHaveBeenCalledWith(
        'Unexpected moderation-follow authentication failure',
        expect.anything(),
      );
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

  describe('verifySignupToken', () => {
    it('should return valid when the invite code is valid', async () => {
      const verifySpy = vi.spyOn(AuthApplication, 'verifySignupToken').mockResolvedValue('valid');

      const result = await AuthController.verifySignupToken('YVB2-YFRN-GDY0');

      expect(verifySpy).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
      expect(result).toBe('valid');
    });

    it('should return used when the invite code has already been used', async () => {
      const verifySpy = vi.spyOn(AuthApplication, 'verifySignupToken').mockResolvedValue('used');

      const result = await AuthController.verifySignupToken('YVB2-YFRN-GDY0');

      expect(verifySpy).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
      expect(result).toBe('used');
    });

    it('should return invalid when the invite code is not recognised', async () => {
      const verifySpy = vi.spyOn(AuthApplication, 'verifySignupToken').mockResolvedValue('invalid');

      const result = await AuthController.verifySignupToken('BADC-0DE0-0000');

      expect(verifySpy).toHaveBeenCalledWith('BADC-0DE0-0000');
      expect(result).toBe('invalid');
    });
  });
});
