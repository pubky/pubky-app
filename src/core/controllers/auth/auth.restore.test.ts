import type { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { HomeserverEventApplication } from '@/application/homeserver-event/homeserver-event';
import { NotificationApplication } from '@/application/notification/notification';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { SettingsApplication } from '@/application/settings/settings';
import { UserApplication } from '@/application/user/user';
import {
  NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
} from '@/config/notification-last-read-sync';
import { THEME_STORAGE_KEY } from '@/config/theme';
import { SettingsController } from '@/controllers/settings/settings';
import { HomeserverEventStreamCoordinator } from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import { NotificationLastReadSyncCoordinator } from '@/coordinators/notification-last-read-sync/notification-last-read-sync';
import * as databaseHelpers from '@/database/franky/franky.helpers';
import { isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { AuthErrorCode, ClientErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Identity } from '@/libs/identity/identity';
import * as utils from '@/libs/utils/utils';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { notificationInitialState } from '@/stores/notification/notification.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultNotificationPreferences, defaultPrivacyPreferences } from '@/stores/settings/settings.types';
import { useSignInStore } from '@/stores/signIn/signIn.store';
import { signInInitialState } from '@/stores/signIn/signIn.types';
import { mockGrantReference, mockPubky, mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

vi.mock('@/application/pubchi/pubchi', () => ({
  PubchiApplication: {
    unpublishKnownDelegations: vi.fn().mockResolvedValue({ failed: [] }),
    clearOwnerData: vi.fn().mockResolvedValue(undefined),
  },
}));

const pubkyA = mockPubky('5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y');
const pubkyB = mockPubky('o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo');
const sessionA = mockSession({
  info: asOpaque({ publicKey: { z32: () => pubkyA }, capabilities: ['/:rw'] }),
  grant: asOpaque({ sessionInfo: async () => mockGrantReference() }),
});
const sessionB = mockSession({
  info: asOpaque({ publicKey: { z32: () => pubkyB }, capabilities: ['/:rw'] }),
  grant: asOpaque({ sessionInfo: async () => mockGrantReference('grant-b') }),
});
const savedSettings = {
  notifications: { ...defaultNotificationPreferences, follow: false },
  privacy: { ...defaultPrivacyPreferences, neverShowPosts: true, moderationBot: pubkyB },
  updatedAt: 10,
  version: 1,
};
const completedSignIn = {
  authUrlResolved: true,
  profileChecked: true,
  bootstrapFetched: true,
  dataPersisted: true,
  homeserverSynced: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const profileError = () =>
  Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session expired', {
    service: ErrorService.Homeserver,
    operation: 'userIsSignedUp',
  });

const wrongEnvironmentError = () =>
  Err.auth(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER, 'Wrong environment', {
    service: ErrorService.Homeserver,
    operation: 'guard',
  });

function persistState() {
  const state = useAuthStore.getState();
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({
      version: 3,
      state: {
        generation: state.generation,
        currentUserPubky: state.currentUserPubky,
        sessionReference: state.sessionReference,
        hasProfile: state.hasProfile,
        retiringSession: null,
      },
    }),
  );
}

async function replaceAccount() {
  await AuthController.logout();
  useAuthStore.getState().setIsLoggingOut(false);
  // A different tab has restored B. Use a distinct generation, as durable adoption does.
  useAuthStore.getState().init({ session: sessionB, currentUserPubky: pubkyB, hasProfile: false });
  persistState();
}

const pkarrLookupError = () =>
  Err.network(NetworkErrorCode.CONNECTION_FAILED, 'PKARR lookup failed', {
    service: ErrorService.Homeserver,
    operation: 'resolveHomeserverRecord',
  });

/** A fresh browser with no saved account: an interactive sign-in runs the full bootstrap. */
function prepareFreshLogin() {
  localStorage.clear();
  useAuthStore.setState({ ...authInitialState, hasHydrated: true });
  vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(asOpaque({}));
  vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(asOpaque({}));
  vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(mockGrantReference());
  vi.spyOn(HomeserverService, 'request')
    .mockResolvedValueOnce({ name: 'Account A' })
    .mockResolvedValueOnce(savedSettings);
}

function startFreshRecoveryLogin() {
  prepareFreshLogin();
  vi.spyOn(AuthApplication, 'signIn').mockResolvedValue({ session: sessionA });
  return AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' });
}

describe('AuthController restored session lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => unknown) => callback() } });
    useAuthStore.setState(authInitialState);
    useSettingsStore.getState().reset();
    useNotificationStore.getState().reset();
    useSignInStore.getState().reset();
    useOnboardingStore.getState().reset();
    useAuthStore.setState({
      hasHydrated: true,
      isLoggingOut: false,
      sessionReference: mockGrantReference(),
      currentUserPubky: pubkyA,
      hasProfile: null,
    });
    persistState();
    vi.spyOn(HomeserverService, 'restoreReference').mockResolvedValue(sessionA);
    vi.spyOn(HomeserverService, 'assertUserHomeserverAllowed').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'logout').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'logoutLegacyCookie').mockResolvedValue(undefined);
    vi.spyOn(databaseHelpers, 'clearDatabase').mockResolvedValue(undefined);
    vi.spyOn(utils, 'sleep').mockResolvedValue(undefined);
    vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notificationInitialState);
    vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(undefined);
    // createLastRead crosses into the WASM SDK; keep settings normalization and stores real.
    vi.spyOn(NotificationNormalizer, 'to').mockReturnValue(
      asOpaque<LastReadResult>({ meta: { url: `pubky://${pubkyA}/pub/pubky.app/last_read` } }),
    );
  });

  afterEach(() => {
    NotificationLastReadSyncCoordinator.resetInstance();
    HomeserverEventStreamCoordinator.resetInstance();
    AuthController.cancelModerationFollow();
    useSignInStore.getState().reset();
    useOnboardingStore.getState().reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['local', 'broadcast'])(
    'requires normal sign-in after a %s active failure without erasing saved account data',
    (source) => {
      useAuthStore.setState({ session: sessionA, restoreStatus: 'ready', hasProfile: true });
      useSignInStore.setState(completedSignIn);
      useOnboardingStore
        .getState()
        .setSecrets({ secretKey: 'retained-secret-key', mnemonic: 'retained recovery phrase' });
      const onboardingBefore = useOnboardingStore.getState();
      const settingsBefore = useSettingsStore.getState();
      persistState();
      const before = useAuthStore.getState();
      expect(
        AuthController.requireSessionReauthentication({
          session: source === 'local' ? sessionA : undefined,
          generation: before.generation,
        }),
      ).toBe(true);
      expect(useAuthStore.getState()).toMatchObject({
        session: null,
        restoreStatus: 'reauth-required',
        currentUserPubky: pubkyA,
        sessionReference: before.sessionReference,
        hasProfile: true,
        generation: before.generation,
      });
      expect(useSignInStore.getState()).toMatchObject(signInInitialState);
      expect(useOnboardingStore.getState()).toBe(onboardingBefore);
      expect(useSettingsStore.getState()).toBe(settingsBefore);
      expect(databaseHelpers.clearDatabase).not.toHaveBeenCalled();
      expect(HomeserverService.logout).not.toHaveBeenCalled();
      // A duplicate notification must not reset progress for the next sign-in attempt.
      useSignInStore.setState({ authUrlResolved: true });
      const nextSignIn = useSignInStore.getState();
      expect(AuthController.requireSessionReauthentication({ generation: before.generation })).toBe(false);
      expect(useSignInStore.getState()).toBe(nextSignIn);
    },
  );

  it.each(['different-session', 'different-generation', 'newer-durable-login', 'logging-out'])(
    'ignores a stale active failure: %s',
    (condition) => {
      useAuthStore.setState({ session: sessionA, restoreStatus: 'ready', generation: 'current' });
      useSignInStore.setState(completedSignIn);
      const signInBefore = useSignInStore.getState();
      persistState();
      if (condition === 'newer-durable-login') {
        const stored = JSON.parse(localStorage.getItem(AUTH_PERSIST_KEY)!);
        stored.state.generation = 'newer';
        localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify(stored));
      }
      if (condition === 'logging-out') useAuthStore.setState({ isLoggingOut: true });
      expect(
        AuthController.requireSessionReauthentication({
          session: condition === 'different-session' ? sessionB : sessionA,
          generation: condition === 'different-generation' ? 'old' : 'current',
        }),
      ).toBe(false);
      expect(useAuthStore.getState()).toMatchObject({ session: sessionA, restoreStatus: 'ready' });
      expect(useSignInStore.getState()).toBe(signInBefore);
    },
  );

  it.each(['exists', 'missing', 'failed'] as const)(
    'ignores a late %s profile result after logout and account replacement',
    async (result) => {
      const profile = deferred<unknown>();
      const request = vi.spyOn(HomeserverService, 'request').mockImplementation(() => profile.promise);
      const restore = AuthController.restorePersistedSession();
      await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());

      await replaceAccount();
      // Simulate B owning another in-flight profile resolution.
      useAuthStore.getState().setRestoreStatus('restoring');
      const replacement = useAuthStore.getState();
      const clearCount = vi.mocked(databaseHelpers.clearDatabase).mock.calls.length;

      if (result === 'exists') profile.resolve({ name: 'Account A' });
      else if (result === 'failed') profile.reject(profileError());
      else {
        profile.reject(
          Err.client(ClientErrorCode.NOT_FOUND, 'Profile not found', {
            service: ErrorService.Homeserver,
            operation: 'userIsSignedUp',
          }),
        );
      }

      await expect(restore).resolves.toBe(false);
      expect(useAuthStore.getState()).toBe(replacement);
      expect(useAuthStore.getState()).toMatchObject({
        session: sessionB,
        hasProfile: false,
        restoreStatus: 'restoring',
      });
      expect(databaseHelpers.clearDatabase).toHaveBeenCalledTimes(clearCount);
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
    },
  );

  it('ignores a late profile result after the same account receives a new session', async () => {
    const profile = deferred<unknown>();
    const request = vi.spyOn(HomeserverService, 'request').mockImplementation(() => profile.promise);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());

    useAuthStore.getState().init({ session: sessionB, currentUserPubky: pubkyA, hasProfile: false });
    persistState();
    profile.resolve({ name: 'Old session profile' });

    await expect(restore).resolves.toBe(false);
    expect(useAuthStore.getState()).toMatchObject({ session: sessionB, currentUserPubky: pubkyA, hasProfile: false });
  });

  it('revokes restored credentials without requesting an unavailable profile', async () => {
    const request = vi.spyOn(HomeserverService, 'request').mockRejectedValue(
      Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Profile unavailable', {
        service: ErrorService.Homeserver,
        operation: 'userIsSignedUp',
      }),
    );

    await AuthController.logout();

    expect(HomeserverService.restoreReference).toHaveBeenCalled();
    expect(HomeserverService.logout).toHaveBeenCalledWith({ session: sessionA });
    expect(request).not.toHaveBeenCalled();
    expect(useAuthStore.getState().sessionReference).toBeNull();
    expect(databaseHelpers.clearDatabase).toHaveBeenCalledOnce();
  });

  it('forgets the theme preference on sign-out, in storage and in the open theme state', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    let themeInMemory = 'light';
    // Mirrors next-themes: a removal announced for its key resets it to the default and stores that.
    const nextThemesListener = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || event.newValue) return;
      themeInMemory = 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, themeInMemory);
    };
    window.addEventListener('storage', nextThemesListener);

    await AuthController.logout();
    window.removeEventListener('storage', nextThemesListener);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(themeInMemory).toBe('dark');
  });

  it('lets logout revoke a session while a route guard is also restoring it', async () => {
    const session = deferred<typeof sessionA>();
    vi.mocked(HomeserverService.restoreReference).mockReturnValue(session.promise);
    const request = vi.spyOn(HomeserverService, 'request');

    const restore = AuthController.restorePersistedSession();
    const logout = AuthController.logout();
    session.resolve(sessionA);
    await logout;

    await expect(restore).resolves.toBe(false);
    expect(HomeserverService.restoreReference).toHaveBeenCalled();
    expect(HomeserverService.logout).toHaveBeenCalledWith({ session: sessionA });
    expect(request).not.toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
    expect(databaseHelpers.clearDatabase).toHaveBeenCalledOnce();
  });

  it('revokes Pubchi device access before dropping its session, then clears only the outgoing owner', async () => {
    useAuthStore.setState({ session: sessionA, restoreStatus: 'ready', hasProfile: true });
    persistState();
    vi.mocked(PubchiApplication.unpublishKnownDelegations).mockImplementationOnce(async (owner, options) => {
      expect(owner).toBe(pubkyA);
      expect(options).toEqual({ attemptRemote: true });
      expect(useAuthStore.getState().session).toBe(sessionA);
      expect(HomeserverService.logout).not.toHaveBeenCalled();
      return { failed: [] };
    });
    vi.mocked(PubchiApplication.clearOwnerData).mockImplementationOnce(async (owner, isCurrent) => {
      expect(owner).toBe(pubkyA);
      expect(isCurrent?.()).toBe(true);
      expect(useAuthStore.getState().session).toBeNull();
    });
    localStorage.setItem(`pubchi-cursor:${pubkyA}`, 'old-account');
    localStorage.setItem(`pubchi-cursor:${pubkyB}`, 'other-account');

    await AuthController.logout();

    expect(PubchiApplication.clearOwnerData).toHaveBeenCalledWith(pubkyA, expect.any(Function));
    expect(localStorage.getItem(`pubchi-cursor:${pubkyA}`)).toBeNull();
    expect(localStorage.getItem(`pubchi-cursor:${pubkyB}`)).toBe('other-account');
  });

  it('finishes local logout when Pubchi revocation fails', async () => {
    useAuthStore.setState({ session: sessionA, restoreStatus: 'ready', hasProfile: true });
    persistState();
    vi.mocked(PubchiApplication.unpublishKnownDelegations).mockRejectedValueOnce(new Error('offline'));

    await expect(AuthController.logout()).resolves.toBeUndefined();

    expect(useAuthStore.getState().session).toBeNull();
    expect(PubchiApplication.clearOwnerData).toHaveBeenCalledWith(pubkyA, expect.any(Function));
  });

  it('loads saved preferences and finishes bootstrap before granting authenticated access', async () => {
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    const request = vi
      .spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings)
      .mockResolvedValue(undefined);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    expect(request).toHaveBeenCalledWith({
      method: HttpMethod.GET,
      url: `pubky://${pubkyA}/pub/pubky.app/settings.json`,
      notFoundAsNull: true,
    });
    expect(useAuthStore.getState()).toMatchObject({ hasProfile: null, isRestoringSession: true });

    bootstrap.resolve(notificationInitialState);
    await expect(restore).resolves.toBe(true);
    expect(useAuthStore.getState()).toMatchObject({ hasProfile: true, isRestoringSession: false });
    expect(useSettingsStore.getState().notifications.follow).toBe(false);
    expect(useSettingsStore.getState().privacy.neverShowPosts).toBe(true);

    await SettingsController.setHideSearch(true);
    expect(request).toHaveBeenLastCalledWith({
      method: HttpMethod.PUT,
      url: `pubky://${pubkyA}/pub/pubky.app/settings.json`,
      bodyJson: expect.objectContaining({
        notifications: expect.objectContaining({ follow: false }),
        privacy: expect.objectContaining({ hideSearch: true, neverShowPosts: true }),
      }),
      fence: expect.anything(),
    });
  });

  it('reconciles last_read after a restored account finishes profile lookup and bootstrap', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    // A public page stays mounted when it adopts an already-profiled account from another tab.
    useAuthStore.setState({ hasProfile: true, needsAccountSync: true });
    persistState();
    const profile = deferred<boolean>();
    const profileLookup = vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockReturnValue(profile.promise);
    vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValue(
      asOpaque<LastReadResult>({ meta: { url: `pubky://${pubkyA}/pub/pubky.app/last_read` } }),
    );
    const freshRead = vi.spyOn(NotificationApplication, 'fetchLastReadFromHomeserver').mockResolvedValue(2_000);
    vi.spyOn(NotificationApplication, 'countFilteredUnreadSince').mockResolvedValue(0);
    const stream = vi.spyOn(HomeserverEventApplication, 'subscribeUserEventStream').mockImplementation(
      async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({
              cursor: 'fresh-boundary',
              eventType: 'PUT',
              path: NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX,
            });
          },
        }),
    );
    const cursorKey = `${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubkyA}`;
    const eventStream = HomeserverEventStreamCoordinator.getInstance();
    eventStream.setRoute(`/post/${pubkyA}/post-id`);
    NotificationLastReadSyncCoordinator.getInstance().start();
    eventStream.start();
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(profileLookup).toHaveBeenCalledOnce());

    const whileProfilePending = {
      connections: stream.mock.calls.length,
      reads: freshRead.mock.calls.length,
      cursor: sessionStorage.getItem(cursorKey),
    };

    profile.resolve(true);
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());
    const whileBootstrapPending = {
      connections: stream.mock.calls.length,
      cursor: sessionStorage.getItem(cursorKey),
    };

    // Bootstrap's ordinary GET may return an older cached boundary than the stream's fresh read.
    bootstrap.resolve({ lastRead: 1_000, unread: 7, lastPolledTimestamp: 5 });
    await expect(restore).resolves.toBe(true);
    // Let restoration settle before asserting, so a failing gate cannot leave bootstrap pending for later tests.
    expect(whileProfilePending).toEqual({ connections: 0, reads: 0, cursor: null });
    expect(whileBootstrapPending).toEqual({ connections: 0, cursor: null });
    await vi.waitFor(() => expect(useNotificationStore.getState()).toMatchObject({ lastRead: 2_000, unread: 0 }));
    await vi.waitFor(() => expect(sessionStorage.getItem(cursorKey)).toBe('fresh-boundary'));

    expect(stream).toHaveBeenCalledOnce();
    expect(useNotificationStore.getState().lastPolledTimestamp).toBe(5);
  });

  it('keeps a newer read boundary adopted while bootstrap was running', async () => {
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings)
      .mockResolvedValue(undefined);
    const countSpy = vi.spyOn(NotificationApplication, 'countFilteredUnreadSince').mockResolvedValue(3);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    // A mark or an already-running read may still complete while bootstrap is pending.
    useNotificationStore.getState().setLastRead(2_000);
    bootstrap.resolve({ lastRead: 1_000, unread: 7, lastPolledTimestamp: 5 });

    await expect(restore).resolves.toBe(true);
    expect(useNotificationStore.getState()).toMatchObject({ lastRead: 2_000, unread: 3, lastPolledTimestamp: 5 });
    expect(countSpy).toHaveBeenCalledWith(2_000, expect.any(Array));
  });

  it('drops a read boundary that was already in the store before bootstrap started', async () => {
    // A snapshot hydrated from storage carries no account owner: another account's tab may have persisted it.
    useNotificationStore.getState().setState({ lastRead: 2_000, unread: 0, lastPolledTimestamp: 9 });
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings)
      .mockResolvedValue(undefined);
    const countSpy = vi.spyOn(NotificationApplication, 'countFilteredUnreadSince').mockResolvedValue(0);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    bootstrap.resolve({ lastRead: 1_000, unread: 1, lastPolledTimestamp: 5 });

    await expect(restore).resolves.toBe(true);
    expect(useNotificationStore.getState()).toMatchObject({ lastRead: 1_000, unread: 1, lastPolledTimestamp: 5 });
    expect(countSpy).not.toHaveBeenCalled();
  });

  it('keeps a boundary adopted during bootstrap even when the store already held an older one', async () => {
    useNotificationStore.getState().setState({ lastRead: 2_000, unread: 0, lastPolledTimestamp: 9 });
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings)
      .mockResolvedValue(undefined);
    const countSpy = vi.spyOn(NotificationApplication, 'countFilteredUnreadSince').mockResolvedValue(2);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    // This account's mark or already-running read completes while bootstrap is pending.
    useNotificationStore.getState().setLastRead(3_000);
    bootstrap.resolve({ lastRead: 1_000, unread: 7, lastPolledTimestamp: 5 });

    await expect(restore).resolves.toBe(true);
    expect(useNotificationStore.getState()).toMatchObject({ lastRead: 3_000, unread: 2, lastPolledTimestamp: 5 });
    expect(countSpy).toHaveBeenCalledWith(3_000, expect.any(Array));
  });

  it('applies the bootstrap read boundary without recounting when the store is not newer', async () => {
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings)
      .mockResolvedValue(undefined);
    const countSpy = vi.spyOn(NotificationApplication, 'countFilteredUnreadSince').mockResolvedValue(3);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    bootstrap.resolve({ lastRead: 1_000, unread: 7, lastPolledTimestamp: 5 });

    await expect(restore).resolves.toBe(true);
    expect(useNotificationStore.getState()).toMatchObject({ lastRead: 1_000, unread: 7 });
    expect(countSpy).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)('ignores bootstrap %s after account replacement', async (result) => {
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    await replaceAccount();
    const replacement = useAuthStore.getState();
    // The newer flow owns the sign-in progress now; the stale restore must not reset it.
    useSignInStore.setState(completedSignIn);
    const replacementSignIn = useSignInStore.getState();
    if (result === 'success') bootstrap.resolve({ unread: 5, lastRead: 100, lastPolledTimestamp: undefined });
    else bootstrap.reject(profileError());

    await expect(restore).resolves.toBe(false);
    expect(useAuthStore.getState()).toBe(replacement);
    expect(useSignInStore.getState()).toBe(replacementSignIn);
    expect(useSettingsStore.getState().privacy.neverShowPosts).toBe(false);
    expect(useNotificationStore.getState().unread).toBe(0);
    expect(UserApplication.ensureModerationFollow).not.toHaveBeenCalled();
  });

  it.each([
    { failure: 'temporary', restoreStatus: 'temporary-error' },
    { failure: 'wrong-environment', restoreStatus: 'reauth-required' },
  ] as const)(
    'preserves its session and offers recovery when bootstrap fails: $failure',
    async ({ failure, restoreStatus }) => {
      vi.spyOn(HomeserverService, 'request')
        .mockResolvedValueOnce({ name: 'Account A' })
        .mockResolvedValueOnce(savedSettings);
      const error = failure === 'temporary' ? profileError() : wrongEnvironmentError();
      vi.mocked(BootstrapApplication.initialize).mockRejectedValue(error);

      const restore = AuthController.restorePersistedSession();
      if (failure === 'temporary') await expect(restore).resolves.toBe(false);
      else await expect(restore).rejects.toBe(error);

      expect(useAuthStore.getState()).toMatchObject({
        session: sessionA,
        hasProfile: null,
        restoreStatus,
      });
      // /sign-in must offer the sign-in choices again, not the primed progress steps.
      expect(useSignInStore.getState()).toMatchObject(signInInitialState);
      expect(databaseHelpers.clearDatabase).not.toHaveBeenCalled();
    },
  );

  it('offers recovery when the saved session becomes unreadable during bootstrap', async () => {
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings);
    const generation = useAuthStore.getState().generation;
    vi.mocked(BootstrapApplication.initialize).mockImplementation(async () => {
      // The post-restore storage check cannot parse the record and falls back to recovery.
      localStorage.setItem(AUTH_PERSIST_KEY, '{');
      return notificationInitialState;
    });

    await expect(AuthController.restorePersistedSession()).resolves.toBe(false);

    expect(useAuthStore.getState()).toMatchObject({ session: sessionA, generation, restoreStatus: 'temporary-error' });
    expect(useSignInStore.getState()).toMatchObject(signInInitialState);
  });

  it('offers the sign-in choices again when an interactive sign-in bootstrap fails', async () => {
    const error = profileError();
    vi.mocked(BootstrapApplication.initialize).mockRejectedValue(error);

    await expect(startFreshRecoveryLogin()).rejects.toBe(error);

    expect(useAuthStore.getState()).toMatchObject({
      session: sessionA,
      currentUserPubky: pubkyA,
      hasProfile: null,
      restoreStatus: 'temporary-error',
    });
    // /sign-in must offer the sign-in choices again, not the primed progress steps.
    expect(useSignInStore.getState()).toMatchObject(signInInitialState);
  });

  it('signs in once the PKARR lookup recovers within the retry window', async () => {
    prepareFreshLogin();
    const signIn = vi
      .spyOn(HomeserverService, 'signIn')
      .mockRejectedValueOnce(pkarrLookupError())
      .mockRejectedValueOnce(pkarrLookupError())
      .mockResolvedValueOnce({ session: sessionA });

    await expect(
      AuthController.loginWithEncryptedFile({ encryptedFile: new File([], 'backup.pkarr'), password: 'password' }),
    ).resolves.toBe(true);

    expect(signIn).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState()).toMatchObject({ session: sessionA, currentUserPubky: pubkyA, hasProfile: true });
  });

  it('makes no further sign-in attempt once a newer flow starts while a retry is pending', async () => {
    prepareFreshLogin();
    const error = pkarrLookupError();
    const signIn = vi.spyOn(HomeserverService, 'signIn').mockRejectedValue(error);
    const backoff = deferred<void>();
    vi.mocked(utils.sleep).mockReturnValueOnce(backoff.promise);
    const before = useAuthStore.getState();

    const login = AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' });
    await vi.waitFor(() => expect(signIn).toHaveBeenCalledOnce());
    AuthController.cancelActiveAuthFlow();
    backoff.resolve();

    await expect(login).rejects.toSatisfy(isAuthFlowCanceledError);
    expect(signIn).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toBe(before);
  });

  it('ignores an interactive bootstrap failure after account replacement', async () => {
    const bootstrap = deferred<typeof notificationInitialState>();
    vi.mocked(BootstrapApplication.initialize).mockReturnValue(bootstrap.promise);
    const login = startFreshRecoveryLogin();
    await vi.waitFor(() => expect(BootstrapApplication.initialize).toHaveBeenCalledOnce());

    await replaceAccount();
    const replacement = useAuthStore.getState();
    // The newer flow owns the sign-in progress now; the superseded sign-in must not reset it.
    useSignInStore.setState(completedSignIn);
    const replacementSignIn = useSignInStore.getState();
    const error = profileError();
    bootstrap.reject(error);

    await expect(login).rejects.toBe(error);
    expect(useAuthStore.getState()).toBe(replacement);
    expect(useSignInStore.getState()).toBe(replacementSignIn);
  });
});
