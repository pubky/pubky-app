import type { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { UserApplication } from '@/application/user/user';
import { SettingsController } from '@/controllers/settings/settings';
import * as databaseHelpers from '@/database/franky/franky.helpers';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import * as utils from '@/libs/utils/utils';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { notificationInitialState } from '@/stores/notification/notification.types';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultNotificationPreferences, defaultPrivacyPreferences } from '@/stores/settings/settings.types';
import { mockGrantReference, mockPubky, mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

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

describe('AuthController restored session lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => unknown) => callback() } });
    useAuthStore.setState(authInitialState);
    useSettingsStore.getState().reset();
    useNotificationStore.getState().reset();
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
    AuthController.cancelModerationFollow();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires normal sign-in after an active failure without erasing saved account data', () => {
    useAuthStore.setState({ session: sessionA, restoreStatus: 'ready', hasProfile: true });
    persistState();
    const before = useAuthStore.getState();
    expect(AuthController.requireSessionReauthentication({ session: sessionA, generation: before.generation })).toBe(
      true,
    );
    expect(useAuthStore.getState()).toMatchObject({
      session: null,
      restoreStatus: 'reauth-required',
      currentUserPubky: pubkyA,
      sessionReference: before.sessionReference,
      hasProfile: true,
      generation: before.generation,
    });
    expect(databaseHelpers.clearDatabase).not.toHaveBeenCalled();
    expect(HomeserverService.logout).not.toHaveBeenCalled();
    expect(AuthController.requireSessionReauthentication({ generation: before.generation })).toBe(false);
  });

  it.each(['different-session', 'different-generation', 'newer-durable-login', 'logging-out'])(
    'ignores a stale active failure: %s',
    (condition) => {
      useAuthStore.setState({ session: sessionA, restoreStatus: 'ready', generation: 'current' });
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
    });
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
    if (result === 'success') bootstrap.resolve({ unread: 5, lastRead: 100, lastPolledTimestamp: undefined });
    else bootstrap.reject(profileError());

    await expect(restore).resolves.toBe(false);
    expect(useAuthStore.getState()).toBe(replacement);
    expect(useSettingsStore.getState().privacy.neverShowPosts).toBe(false);
    expect(useNotificationStore.getState().unread).toBe(0);
    expect(UserApplication.ensureModerationFollow).not.toHaveBeenCalled();
  });

  it('preserves its session and offers recovery when bootstrap fails', async () => {
    vi.spyOn(HomeserverService, 'request')
      .mockResolvedValueOnce({ name: 'Account A' })
      .mockResolvedValueOnce(savedSettings);
    vi.mocked(BootstrapApplication.initialize).mockRejectedValue(profileError());

    await expect(AuthController.restorePersistedSession()).resolves.toBe(false);

    expect(useAuthStore.getState()).toMatchObject({
      session: sessionA,
      hasProfile: null,
      restoreStatus: 'temporary-error',
    });
    expect(databaseHelpers.clearDatabase).not.toHaveBeenCalled();
  });
});
