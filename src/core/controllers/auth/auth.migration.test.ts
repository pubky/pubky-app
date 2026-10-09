import type { Session as LocksSession } from '@synonymdev/locks-sdk';
import type { Keypair, Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { LocksApplication } from '@/application/locks/locks';
import { SettingsApplication } from '@/application/settings/settings';
import { UserApplication } from '@/application/user/user';
import { APP_CAPABILITIES, getAuthClientId, LOCKS_CAPABILITIES } from '@/config/auth';
import { HOMESERVER_CAPABILITIES } from '@/config/network';
import { LocksController } from '@/controllers/locks/locks';
import { ProfileController } from '@/controllers/profile/profile';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { pendingRetirements, type SessionReference } from '@/libs/auth/session.types';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { AuthErrorCode, ClientErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import {
  AUTH_PERSIST_KEY,
  LEGACY_AUTH_PERSIST_KEY,
  LOCKS_AUTH_PERSIST_KEY,
  ONBOARDING_PERSIST_KEY,
  PREVIOUS_AUTH_PERSIST_KEY,
  SETTINGS_PERSIST_KEY,
} from '@/stores/persistedKeys';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { settingsInitialState } from '@/stores/settings/settings.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

vi.mock('@/database/franky/franky.helpers', () => ({ clearDatabase: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/coordinators/notifications/notifications', () => ({ NotificationCoordinator: { resetInstance: vi.fn() } }));
vi.mock('@/coordinators/streams/stream', () => ({ StreamCoordinator: { resetInstance: vi.fn() } }));
vi.mock('@/libs/query-client/query-client.factory', async (original) => ({
  ...(await original<typeof import('@/libs/query-client/query-client.factory')>()),
  clearAllQueryClients: vi.fn(),
}));

const OTHER_PUBKY = '7a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const offline = () =>
  Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Offline', { service: ErrorService.Homeserver, operation: 'test' });
const expired = () =>
  Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Expired', { service: ErrorService.Homeserver, operation: 'test' });
const grantReference = (grantId = 'grant'): SessionReference => ({
  kind: 'grant',
  grantId,
  sessionStoreId: grantId,
  clientId: getAuthClientId(),
  grantExpiresAt: Date.now() / 1000 + 60_000,
  tokenExpiresAt: Date.now() / 1000 + 3600,
});
const grantSession = (
  capabilities: string[] = [APP_CAPABILITIES, ...LOCKS_CAPABILITIES],
  pubky = PUBKY,
  grantId = 'grant',
): Session =>
  asOpaque({
    info: { publicKey: { z32: () => pubky }, capabilities },
    grant: { sessionInfo: vi.fn().mockResolvedValue({ ...grantReference(grantId), publicKey: { z32: () => pubky } }) },
    export: vi.fn(() => {
      throw new Error('Grant secrets must never be exported');
    }),
  });
const narrowGrant = grantSession([APP_CAPABILITIES], PUBKY, 'previous-grant');
const narrowReference = grantReference('previous-grant');
function seed(session: Session | null = narrowGrant, reference: SessionReference | null = narrowReference) {
  useAuthStore.setState({
    ...authInitialState,
    hasHydrated: true,
    generation: '',
    session,
    sessionReference: reference,
    currentUserPubky: reference ? PUBKY : null,
    hasProfile: reference ? true : null,
    restoreStatus: session ? 'ready' : 'idle',
  });
  // Seed durable state explicitly: UI metadata may not replace authentication identity.
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
        retiringSession: state.retiringSession,
      },
    }),
  );
}
const releaseDeferred: (() => void)[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  void promise.catch(() => {});
  releaseDeferred.push(() => reject(createCanceledError()));
  return { promise, resolve, reject };
}
function startFlow() {
  const approval = deferred<Session>();
  const cancel = vi.fn();
  const complete = vi.fn();
  vi.spyOn(AuthApplication, 'startGrantFlow').mockResolvedValue({
    authorizationUrl: 'pubkyauth://grant',
    awaitApproval: approval.promise,
    cancelAuthFlow: cancel,
    completeAuthFlow: complete,
  });
  return { approval, cancel, complete };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, callback: () => void) => callback() },
  });
  localStorage.clear();
  sessionStorage.clear();
  seed();
  useSettingsStore.getState().reset();
  useOnboardingStore.getState().reset();
  vi.spyOn(AuthApplication, 'clearPendingAuthFlow').mockImplementation(() => {});
  AuthController.cancelActiveAuthFlow();
  vi.spyOn(AuthApplication, 'assertUserHomeserverAllowed').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(grantReference());
  vi.spyOn(AuthApplication, 'retainUnusedSession').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'removeSessionRecord').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'logoutLegacyCookie').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'revokeLegacyCookieSessions').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'restoreReference').mockResolvedValue(narrowGrant);
  vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
  vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);
  vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
    unread: 0,
    lastRead: 0,
    lastPolledTimestamp: undefined,
  });
  vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(undefined);
  vi.mocked(clearDatabase).mockClear();
  useLocksAuthStore.getState().reset();
});
afterEach(async () => {
  AuthController.cancelActiveAuthFlow();
  AuthController.cancelModerationFollow();
  for (const release of releaseDeferred.splice(0)) release();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.restoreAllMocks();
});

describe('grant-only session lifecycle', () => {
  it('restores a grant without forcing replacement or clearing account data', async () => {
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: narrowGrant,
    });
    expect(await AuthController.restorePersistedSession()).toBe(true);
    expect(useAuthStore.getState().sessionReference).toEqual(narrowReference);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it.each(['temporary-error', 'reauth-required'] as const)('preserves credentials and cache on %s', async (status) => {
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status });
    expect(await AuthController.restorePersistedSession()).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      sessionReference: narrowReference,
      hasProfile: true,
      restoreStatus: status,
      isRestoringSession: false,
    });
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('bounds a hanging restore and permits retry', async () => {
    vi.useFakeTimers();
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(deferred<never>().promise);
    const result = AuthController.restorePersistedSession();
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await result).toBe(false);
    expect(useAuthStore.getState().restoreStatus).toBe('temporary-error');
  });
  it('keeps loading until a restored grant finishes its missing profile bootstrap', async () => {
    seed(null, grantReference());
    useAuthStore.setState({ hasProfile: null });
    const next = grantSession();
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session: next });
    const profile = deferred<boolean>();
    vi.mocked(AuthApplication.userIsSignedUp).mockReturnValue(profile.promise);
    const restore = AuthController.restorePersistedSession();
    await vi.waitFor(() => expect(AuthApplication.userIsSignedUp).toHaveBeenCalled());
    expect(useAuthStore.getState()).toMatchObject({ isRestoringSession: true, restoreStatus: 'restoring' });
    profile.resolve(false);
    await restore;
    expect(useAuthStore.getState()).toMatchObject({ hasProfile: false, restoreStatus: 'ready' });
  });
  it('reconciles an external logout even when its storage event was missed', async () => {
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: narrowGrant,
    });
    await AuthApplication.commitPersistedAuth(
      {
        currentUserPubky: null,
        hasProfile: null,
        sessionReference: null,
        retiringSession: null,
        generation: 'other-tab-logout',
      },
      '',
    );
    await AuthController.restorePersistedSession();
    expect(useAuthStore.getState()).toMatchObject({
      generation: 'other-tab-logout',
      session: null,
      isRestoringSession: false,
      restoreStatus: 'idle',
    });
  });
  it('preserves profile completion rehydrated while the same generation is restoring', async () => {
    seed(null);
    useAuthStore.setState({ hasProfile: false });
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({ version: 3, state: { ...AuthApplication.readPersistedAuth(), hasProfile: false } }),
    );
    const pending = deferred<Awaited<ReturnType<typeof AuthApplication.restorePersistedSession>>>();
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(pending.promise);
    const restore = AuthController.restorePersistedSession();
    // Another tab creates the profile and completes retirement without replacing this grant.
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({ version: 3, state: { ...AuthApplication.readPersistedAuth(), hasProfile: true } }),
    );
    await AuthController.syncSessionFromStorage();
    pending.resolve({ status: 'restored', session: narrowGrant });
    await restore;
    expect(useAuthStore.getState().hasProfile).toBe(true);
    expect(AuthApplication.readPersistedAuth()?.hasProfile).toBe(true);
  });
  it('does not resurrect a restore that finishes after logout', async () => {
    seed(null);
    const pending = deferred<Awaited<ReturnType<typeof AuthApplication.restorePersistedSession>>>();
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(pending.promise);
    const restore = AuthController.restorePersistedSession();
    await AuthController.logout();
    pending.resolve({ status: 'restored', session: narrowGrant });
    expect(await restore).toBe(false);
    expect(useAuthStore.getState().sessionReference).toBeNull();
  });
  it('requests the merged app and Locks permissions for ordinary Ring sign-in', async () => {
    startFlow();
    await AuthController.getAuthUrl();
    expect(AuthApplication.startGrantFlow).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'signin', capabilities: HOMESERVER_CAPABILITIES }),
    );
  });
  it('requests the current Locks scopes during Ring signup too', async () => {
    startFlow();
    await AuthController.getSignupAuthUrl('invite');
    expect(AuthApplication.startGrantFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'signup',
        capabilities: HOMESERVER_CAPABILITIES,
        inviteCode: 'invite',
      }),
    );
  });
  it('keeps the Locks screen mounted while replacing and retiring a narrow grant', async () => {
    const flow = startFlow();
    const retirement = deferred<void>();
    vi.mocked(AuthApplication.logout).mockReturnValue(retirement.promise);
    const states: string[] = [];
    const unsubscribe = useAuthStore.subscribe((state) => states.push(state.restoreStatus));
    try {
      const result = await AuthController.getUpgradeAuthUrl(true);
      const next = grantSession();
      flow.approval.resolve(next);
      await vi.waitFor(() => expect(AuthApplication.logout).toHaveBeenCalled());
      expect(useAuthStore.getState().session).toBe(next);
      expect(states).not.toContain('restoring');
      retirement.resolve();
      await result!.awaitApproval;
      expect(clearDatabase).not.toHaveBeenCalled();
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
      expect(AuthApplication.startGrantFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'upgrade',
          fresh: true,
          expectedPubky: PUBKY,
          capabilities: HOMESERVER_CAPABILITIES,
        }),
      );
    } finally {
      retirement.resolve();
      unsubscribe();
    }
  });
  it('revokes the separate Lock Server session during app logout', async () => {
    useLocksAuthStore.getState().init({ session: asOpaque({}), secret: 'lock-secret' });
    const signout = vi.spyOn(LocksApplication, 'signout').mockResolvedValue(undefined);
    await AuthController.logout();
    expect(signout).toHaveBeenCalledOnce();
    expect(useLocksAuthStore.getState().selectLocksSession()).toBeNull();
    expect(useLocksAuthStore.getState().selectLocksSessionSecret()).toBeNull();
  });
  it('starts Passport with grants and callbacks, adopting only after popup approval', async () => {
    const flow = startFlow();
    const callbacks = { xSource: 'Pubky', xSuccess: 'https://app.example/passport/return?attempt=1' };
    const result = await AuthController.getPassportAuthUrl({ xCallback: callbacks });
    expect(AuthApplication.startGrantFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'signin',
        capabilities: HOMESERVER_CAPABILITIES,
        xCallback: callbacks,
        fresh: true,
      }),
    );
    const session = grantSession();
    flow.approval.resolve(session);
    await expect(result.awaitApproval).resolves.toBe(session);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    await AuthController.initializeAuthenticatedSession({ session });
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().sessionReference?.kind).toBe('grant');
    expect(flow.complete).toHaveBeenCalledOnce();
    await expect(AuthController.initializeAuthenticatedSession({ session })).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
  });
  it('does not adopt an approved Passport session superseded by a newer Ring request', async () => {
    const flow = startFlow();
    const result = await AuthController.getPassportAuthUrl({ xCallback: { xSource: 'Pubky' } });
    const session = grantSession();
    flow.approval.resolve(session);
    await result.awaitApproval;
    startFlow();
    await AuthController.getAuthUrl();
    await expect(AuthController.initializeAuthenticatedSession({ session })).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(AuthApplication.retainUnusedSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(useAuthStore.getState().session).toBe(narrowGrant);
  });
  it('cancels an active Ring request before starting Passport', async () => {
    const ring = startFlow();
    await AuthController.getAuthUrl();
    startFlow();
    await AuthController.getPassportAuthUrl({ xCallback: { xSource: 'Pubky' } });
    expect(ring.cancel).toHaveBeenCalledOnce();
  });
  it('shares one active approval when Strict Mode requests the same flow twice', async () => {
    const flow = startFlow();
    const [first, second] = await Promise.all([AuthController.getAuthUrl(), AuthController.getAuthUrl()]);
    expect(AuthApplication.startGrantFlow).toHaveBeenCalledOnce();
    expect(first.awaitApproval).toBe(second.awaitApproval);
    expect(flow.cancel).not.toHaveBeenCalled();
  });
  it('does not request extra approval when root grant permissions already cover Locks', async () => {
    seed(asOpaque({ ...narrowGrant, info: { ...narrowGrant.info, capabilities: ['/:rw'] } }));
    startFlow();
    expect(await AuthController.requestCapabilities()).toBeNull();
    expect(AuthApplication.startGrantFlow).not.toHaveBeenCalled();
  });
  it('saves a same-account grant before retiring the previous grant, preserving profile and cache', async () => {
    const flow = startFlow();
    const next = grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]);
    const result = await AuthController.requestCapabilities();
    vi.mocked(AuthApplication.logout).mockImplementation(async ({ session }) => {
      expect(session).toBe(narrowGrant);
      expect(AuthApplication.readPersistedAuth()?.sessionReference?.kind).toBe('grant');
    });
    flow.approval.resolve(next);
    await result!.awaitApproval;
    expect(useAuthStore.getState()).toMatchObject({
      session: next,
      hasProfile: true,
      retiringSession: null,
      restoreStatus: 'ready',
    });
    expect(clearDatabase).not.toHaveBeenCalled();
    expect(next.export).not.toHaveBeenCalled();
    expect(flow.complete).toHaveBeenCalledOnce();
  });
  it('rejects a different account during permission upgrade without touching the old session', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], 'another-user'));
    await expect(result!.awaitApproval).rejects.toMatchObject({ name: 'AuthApprovalMismatch' });
    expect(useAuthStore.getState().session).toBe(narrowGrant);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(AuthApplication.logout).not.toHaveBeenCalled();
  });
  it('rejects insufficient approved scopes', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    flow.approval.resolve(grantSession([APP_CAPABILITIES]));
    await expect(result!.awaitApproval).rejects.toMatchObject({ name: 'AuthApprovalMismatch' });
    expect(useAuthStore.getState().session).toBe(narrowGrant);
  });
  it('keeps the old session on cancel even if its approval arrives later', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    result!.cancelAuthFlow();
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await expect(result!.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(useAuthStore.getState().session).toBe(narrowGrant);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(AuthApplication.retainUnusedSession).toHaveBeenCalledOnce();
  });
  it.each(['sdk', 'reference'])('keeps the old session if %s persistence fails', async (stage) => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    if (stage === 'sdk') vi.mocked(AuthApplication.saveSession).mockRejectedValue(offline());
    else vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValue(offline());
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await expect(result!.awaitApproval).rejects.toThrow();
    expect(useAuthStore.getState().session).toBe(narrowGrant);
    expect(AuthApplication.logout).not.toHaveBeenCalled();
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('keeps the new grant and pending retirement when previous grant signout cannot be confirmed', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    vi.mocked(AuthApplication.logout).mockRejectedValueOnce(offline());
    const next = grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]);
    flow.approval.resolve(next);
    await expect(result!.awaitApproval).resolves.toBe(next);
    expect(useAuthStore.getState()).toMatchObject({
      session: next,
      sessionReference: { kind: 'grant' },
      pendingRetirements: [narrowReference],
      restoreStatus: 'ready',
    });
    await AuthController.restorePersistedSession();
    expect(useAuthStore.getState().retiringSession).toBeNull();
    expect(useAuthStore.getState().restoreStatus).toBe('ready');
  });
  it('keeps a valid replacement and retains revocation credentials after an ambiguous auth failure', async () => {
    const warn = vi.spyOn(Logger, 'warn');
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    vi.mocked(AuthApplication.logout).mockRejectedValue(expired());
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await expect(result!.awaitApproval).resolves.toBeDefined();
    expect(useAuthStore.getState().retiringSession).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
  it.each(['restore', 'signout'])(
    'adopts a valid replacement when the old grant is rejected during %s',
    async (stage) => {
      const old = grantReference('revoked');
      seed(stage === 'restore' ? null : grantSession(), old);
      useAuthStore.getState().setRestoreStatus('reauth-required');
      const flow = startFlow();
      const result = await AuthController.getAuthUrl();
      if (stage === 'restore') vi.mocked(AuthApplication.restoreReference).mockRejectedValue(expired());
      else vi.mocked(AuthApplication.logout).mockRejectedValue(expired());
      const next = grantSession();
      flow.approval.resolve(next);
      await expect(result.awaitApproval).resolves.toBe(next);
      expect(useAuthStore.getState()).toMatchObject({
        session: next,
        restoreStatus: 'ready',
        retiringSession: null,
        hasProfile: true,
      });
      expect(pendingRetirements(AuthApplication.readPersistedAuth()!)).toContainEqual(old);
      expect(AuthApplication.removeSessionRecord).not.toHaveBeenCalledWith(old);
      expect(clearDatabase).not.toHaveBeenCalled();
    },
  );
  it('keeps grant retirement retryable when IndexedDB is temporarily unavailable', async () => {
    seed(null, grantReference('old'));
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    vi.mocked(AuthApplication.restoreReference).mockRejectedValue(offline());
    flow.approval.resolve(grantSession());
    await expect(result.awaitApproval).resolves.toBeDefined();
    expect(useAuthStore.getState()).toMatchObject({
      restoreStatus: 'ready',
      pendingRetirements: [expect.objectContaining({ grantId: 'old' })],
    });
    expect(AuthApplication.removeSessionRecord).not.toHaveBeenCalled();
  });
  it('bootstraps a different account from clean tab state even when its profile is already known', async () => {
    useSettingsStore.getState().setMutedUsers(['alice-only-mute']);
    const other = OTHER_PUBKY;
    const remoteSettings = { ...settingsInitialState, muted: ['bob-only-mute'] };
    // The other tab has already persisted its own settings. Resetting this tab must preserve them.
    const sharedSettings = JSON.stringify({ state: remoteSettings, version: 0 });
    localStorage.setItem(SETTINGS_PERSIST_KEY, sharedSettings);
    await AuthApplication.commitPersistedAuth(
      {
        generation: 'other-tab',
        currentUserPubky: other,
        sessionReference: grantReference('other'),
        hasProfile: true,
        retiringSession: null,
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession([APP_CAPABILITIES], other),
    });
    vi.mocked(AuthApplication.userIsSignedUp).mockResolvedValue(true);
    vi.mocked(SettingsApplication.initializeSettings).mockImplementation(async (_pubky, local) => {
      expect(local.muted).toEqual([]);
      expect(localStorage.getItem(SETTINGS_PERSIST_KEY)).toBe(sharedSettings);
      return remoteSettings;
    });
    await AuthController.syncSessionFromStorage();
    expect(useSettingsStore.getState().muted).toEqual(['bob-only-mute']);
    expect(useAuthStore.getState()).toMatchObject({
      currentUserPubky: other,
      needsAccountSync: false,
      restoreStatus: 'ready',
    });
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('retries the new account bootstrap after a temporary failure', async () => {
    useSettingsStore.getState().setMutedUsers(['alice-only-mute']);
    await AuthApplication.commitPersistedAuth(
      {
        generation: 'other-tab',
        currentUserPubky: OTHER_PUBKY,
        sessionReference: grantReference('other'),
        hasProfile: true,
        retiringSession: null,
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession([APP_CAPABILITIES], OTHER_PUBKY),
    });
    vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockResolvedValueOnce(null);
    await AuthController.syncSessionFromStorage();
    expect(useAuthStore.getState()).toMatchObject({ needsAccountSync: true, restoreStatus: 'temporary-error' });
    vi.mocked(AuthApplication.userIsSignedUp).mockResolvedValue(true);
    await AuthController.restorePersistedSession();
    expect(SettingsApplication.initializeSettings).toHaveBeenCalledWith(
      OTHER_PUBKY,
      expect.objectContaining({ muted: [] }),
    );
    expect(useAuthStore.getState()).toMatchObject({ needsAccountSync: false, restoreStatus: 'ready' });
  });
  it.each(['current', 'legacy'])('preserves the incoming signup backup from %s onboarding storage', async (kind) => {
    const recovery = { secretKey: 'new-account-secret', mnemonic: 'new-account-phrase' };
    const signupAttempt =
      kind === 'current' ? { pubky: OTHER_PUBKY, homeserver: 'hs', environment: 'test', phase: 'created' } : null;
    localStorage.setItem(ONBOARDING_PERSIST_KEY, JSON.stringify({ version: 0, state: { ...recovery, signupAttempt } }));
    vi.spyOn(Identity, 'tryZ32FromSecret').mockReturnValue(OTHER_PUBKY);
    await AuthApplication.commitPersistedAuth(
      {
        generation: 'new-signup',
        currentUserPubky: OTHER_PUBKY,
        sessionReference: grantReference('new-signup'),
        hasProfile: false,
        retiringSession: null,
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession([APP_CAPABILITIES], OTHER_PUBKY),
    });
    await AuthController.syncSessionFromStorage();
    expect(useOnboardingStore.getState()).toMatchObject(recovery);
    // Profile completion writes this flag; it must not persist null recovery keys over the other tab's backup.
    useOnboardingStore.getState().setShowWelcomeDialog(true);
    expect(JSON.parse(localStorage.getItem(ONBOARDING_PERSIST_KEY)!).state).toMatchObject(recovery);
  });
  it('does not expose a previous account backup after a cross-tab account change', async () => {
    useOnboardingStore.getState().setSecrets({ secretKey: 'old-account-secret', mnemonic: 'old-account-phrase' });
    useOnboardingStore
      .getState()
      .setSignupAttempt({ pubky: PUBKY, homeserver: 'hs', environment: 'test', phase: 'created' });
    await AuthApplication.commitPersistedAuth(
      {
        generation: 'other-signup',
        currentUserPubky: OTHER_PUBKY,
        sessionReference: grantReference('other-signup'),
        hasProfile: false,
        retiringSession: null,
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession([APP_CAPABILITIES], OTHER_PUBKY),
    });
    await AuthController.syncSessionFromStorage();
    expect(useOnboardingStore.getState()).toMatchObject({ secretKey: null, mnemonic: null, signupAttempt: null });
  });
  it('preserves account-local state when another tab upgrades the same account', async () => {
    useSettingsStore.getState().setMutedUsers(['same-account-mute']);
    const locksSession = asOpaque<LocksSession>({});
    useLocksAuthStore.getState().init({ session: locksSession, secret: 'same-account-lock-secret' });
    await AuthApplication.commitPersistedAuth(
      {
        generation: 'upgraded',
        currentUserPubky: PUBKY,
        sessionReference: grantReference('upgraded'),
        hasProfile: true,
        retiringSession: null,
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession(),
    });
    await AuthController.syncSessionFromStorage();
    expect(useSettingsStore.getState().muted).toEqual(['same-account-mute']);
    expect(useLocksAuthStore.getState()).toMatchObject({
      session: locksSession,
      locksSessionSecret: 'same-account-lock-secret',
    });
    expect(SettingsApplication.initializeSettings).not.toHaveBeenCalled();
  });
  it('fences a pending save when another tab commits logout', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    const save = deferred<SessionReference>();
    vi.mocked(AuthApplication.saveSession).mockReturnValue(save.promise);
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await vi.waitFor(() => expect(AuthApplication.saveSession).toHaveBeenCalled());
    await AuthApplication.commitPersistedAuth(
      {
        currentUserPubky: null,
        sessionReference: null,
        hasProfile: null,
        generation: 'other-tab',
        retiringSession: null,
      },
      '',
    );
    save.resolve(grantReference());
    await expect(result!.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(AuthApplication.readPersistedAuth()?.generation).toBe('other-tab');
    expect(AuthApplication.removeSessionRecord).not.toHaveBeenCalled();
    expect(AuthApplication.retainUnusedSession).toHaveBeenCalledOnce();
    expect(flow.complete).toHaveBeenCalledOnce();
  });
  it('rejects a wrong-environment Ring session before saving it', async () => {
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    vi.mocked(AuthApplication.assertUserHomeserverAllowed).mockRejectedValue(
      Err.auth(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER, 'Wrong environment', {
        service: ErrorService.Homeserver,
        operation: 'guard',
      }),
    );
    flow.approval.resolve(grantSession());
    await expect(result.awaitApproval).rejects.toMatchObject({ code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER });
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
  });
  it.each(['mnemonic', 'file'])('persists the root grant from %s login', async (method) => {
    seed(null, null);
    const keypair = asOpaque<Keypair>({ publicKey: { z32: () => PUBKY } });
    vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(keypair);
    vi.spyOn(Identity, 'decryptRecoveryFile').mockResolvedValue(keypair);
    const next = grantSession(['/:rw']);
    vi.spyOn(AuthApplication, 'signIn').mockResolvedValue({ session: next });
    const result =
      method === 'mnemonic'
        ? await AuthController.loginWithMnemonic({ mnemonic: 'phrase' })
        : await AuthController.loginWithEncryptedFile({ encryptedFile: new File([], 'backup'), password: 'password' });
    expect(result).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({ session: next, hasProfile: false });
    expect(AuthApplication.readPersistedAuth()?.sessionReference?.kind).toBe('grant');
    expect(clearDatabase).toHaveBeenCalledOnce();
  });
  it('cleans up locally after a bounded offline logout', async () => {
    vi.useFakeTimers();
    const remote = deferred<void>();
    vi.mocked(AuthApplication.logout).mockReturnValue(remote.promise);
    const logout = AuthController.logout();
    await vi.advanceTimersByTimeAsync(5001);
    await logout;
    expect(useAuthStore.getState().sessionReference).toBeNull();
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toBeNull();
    expect(clearDatabase).toHaveBeenCalledOnce();
    remote.resolve();
    await vi.advanceTimersByTimeAsync(1);
  });
  it('uses the saved grant for logout after a reload', async () => {
    seed(null, grantReference());
    const next = grantSession();
    vi.mocked(AuthApplication.restoreReference).mockResolvedValue(next);
    await AuthController.logout();
    expect(AuthApplication.restoreReference).toHaveBeenCalledWith(expect.objectContaining({ kind: 'grant' }));
    expect(AuthApplication.logout).toHaveBeenCalledWith({ session: next });
    expect(AuthApplication.removeSessionRecord).toHaveBeenCalled();
  });
  it('does not clear a newer account when an old logout finishes', async () => {
    const remote = deferred<void>();
    vi.mocked(AuthApplication.logout).mockReturnValue(remote.promise);
    const logout = AuthController.logout();
    await vi.waitFor(() => expect(AuthApplication.logout).toHaveBeenCalled());
    const previous = useAuthStore.getState().generation;
    const next = {
      generation: 'new-login',
      sessionReference: grantReference('new'),
      currentUserPubky: PUBKY,
      hasProfile: true,
      retiringSession: null,
    };
    await AuthApplication.commitPersistedAuth(next, previous);
    useAuthStore.getState().init({ ...next, session: grantSession() });
    remote.resolve();
    await expect(logout).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(useAuthStore.getState().generation).toBe('new-login');
    expect(clearDatabase).not.toHaveBeenCalled();
  });
});

describe('signup recovery', () => {
  beforeEach(() => {
    seed(null, null);
    vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(asOpaque({ publicKey: { z32: () => PUBKY } }));
    vi.spyOn(AuthApplication, 'createAccount').mockResolvedValue(undefined);
    vi.spyOn(AuthApplication, 'signInCreatedAccount').mockResolvedValue({ session: grantSession(['/:rw']) });
  });
  it('does not consume an invite again after grant exchange fails', async () => {
    vi.mocked(AuthApplication.signInCreatedAccount).mockRejectedValueOnce(offline());
    await expect(AuthController.signUp({ secretKey: 'key', signupToken: 'invite' })).rejects.toThrow();
    expect(useOnboardingStore.getState().signupAttempt?.phase).toBe('created');
    await AuthController.signUp({ secretKey: 'key', signupToken: 'invite' });
    expect(AuthApplication.createAccount).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().sessionReference?.kind).toBe('grant');
  });
  it('tries signin first after an uncertain creation response', async () => {
    vi.mocked(AuthApplication.createAccount).mockRejectedValueOnce(offline());
    await expect(AuthController.signUp({ secretKey: 'key', signupToken: 'invite' })).rejects.toThrow();
    await AuthController.signUp({ secretKey: 'key', signupToken: 'invite' });
    expect(AuthApplication.createAccount).toHaveBeenCalledOnce();
  });
  it('creates again only when the uncertain account is proven absent', async () => {
    vi.mocked(AuthApplication.createAccount).mockRejectedValueOnce(offline());
    await expect(AuthController.signUp({ secretKey: 'key', signupToken: 'invite' })).rejects.toThrow();
    vi.mocked(AuthApplication.signInCreatedAccount).mockRejectedValueOnce(
      Err.client(ClientErrorCode.NOT_FOUND, 'Absent', { service: ErrorService.Homeserver, operation: 'signin' }),
    );
    await AuthController.signUp({ secretKey: 'key', signupToken: 'invite' });
    expect(AuthApplication.createAccount).toHaveBeenCalledTimes(2);
  });
  it.each(['logout', 'new login'])(
    'does not resume uncertain signup after %s while the account lookup is pending',
    async (replacement) => {
      vi.mocked(AuthApplication.createAccount).mockRejectedValueOnce(offline());
      await expect(AuthController.signUp({ secretKey: 'key', signupToken: 'invite' })).rejects.toThrow();
      const lookup = deferred<Awaited<ReturnType<typeof AuthApplication.signInCreatedAccount>>>();
      vi.mocked(AuthApplication.signInCreatedAccount).mockReturnValueOnce(lookup.promise);
      const signup = AuthController.signUp({ secretKey: 'key', signupToken: 'invite' });

      if (replacement === 'logout') await AuthController.logout();
      else {
        const flow = startFlow();
        const login = await AuthController.getAuthUrl();
        flow.approval.resolve(grantSession(['/:rw'], OTHER_PUBKY));
        await login.awaitApproval;
      }
      const nextAttempt = useOnboardingStore.getState().signupAttempt;
      const nextAccount = useAuthStore.getState().currentUserPubky;
      lookup.reject(
        Err.client(ClientErrorCode.NOT_FOUND, 'Absent', { service: ErrorService.Homeserver, operation: 'signin' }),
      );

      await expect(signup).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
      expect(AuthApplication.createAccount).toHaveBeenCalledOnce();
      expect(useOnboardingStore.getState().signupAttempt).toEqual(nextAttempt);
      expect(useAuthStore.getState().currentUserPubky).toBe(nextAccount);
    },
  );
});

describe('grant-only migration and SDK removal events', () => {
  it('settles hydration into recovery when migration stalls and retries after the lock becomes available', async () => {
    vi.useFakeTimers();
    useAuthStore.setState(authInitialState);
    localStorage.clear();
    const legacy = JSON.stringify({ state: { currentUserPubky: PUBKY, sessionExport: 'cookie', hasProfile: true } });
    localStorage.setItem(LEGACY_AUTH_PERSIST_KEY, legacy);
    vi.spyOn(navigator.locks, 'request').mockImplementation(() => new Promise(() => {}));

    const hydration = useAuthStore.persist.rehydrate();
    await vi.advanceTimersByTimeAsync(12_001);
    expect(useAuthStore.getState()).toMatchObject({
      hasHydrated: true,
      restoreStatus: 'temporary-error',
      isRestoringSession: false,
    });
    await hydration;
    expect(localStorage.getItem(LEGACY_AUTH_PERSIST_KEY)).toBe(legacy);
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).toBeNull();

    vi.mocked(navigator.locks.request).mockRestore();
    await AuthController.restorePersistedSession();
    expect(useAuthStore.getState()).toMatchObject({
      hasHydrated: true,
      currentUserPubky: PUBKY,
      session: null,
      restoreStatus: 'reauth-required',
    });
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('hydrates a legacy cookie as reauthorization without restoring it or clearing account data', async () => {
    useAuthStore.setState(authInitialState);
    localStorage.clear();
    localStorage.setItem(
      PREVIOUS_AUTH_PERSIST_KEY,
      JSON.stringify({
        version: 2,
        state: {
          generation: 'cookie-generation',
          currentUserPubky: PUBKY,
          hasProfile: true,
          sessionReference: { kind: 'cookie', sessionExport: 'old-secret' },
          retiringSession: null,
        },
      }),
    );
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState()).toMatchObject({
      currentUserPubky: PUBKY,
      session: null,
      sessionReference: null,
      hasProfile: true,
      hasHydrated: true,
      restoreStatus: 'reauth-required',
      isRestoringSession: false,
    });
    expect(await AuthController.restorePersistedSession()).toBe(false);
    expect(AuthApplication.restoreReference).not.toHaveBeenCalled();
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(clearDatabase).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_PERSIST_KEY)).not.toContain('old-secret');
  });
  it('ignores removal of a retired or unrelated grant', async () => {
    await AuthController.syncRemovedSession('unrelated');
    expect(useAuthStore.getState().session).toBe(narrowGrant);
  });
  it('requires reauthorization when the SDK confirms removal of the active grant', async () => {
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'reauth-required' });
    await AuthController.syncRemovedSession(narrowReference.sessionStoreId);
    expect(useAuthStore.getState()).toMatchObject({
      session: null,
      sessionReference: narrowReference,
      restoreStatus: 'reauth-required',
    });
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('rechecks a delayed clear notification and preserves a still-valid grant', async () => {
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: narrowGrant,
    });
    await AuthController.syncRemovedSession(null);
    expect(useAuthStore.getState()).toMatchObject({ session: narrowGrant, restoreStatus: 'ready' });
  });
  it('does not resurrect a handle from a restore that was running when removal arrived', async () => {
    seed(null, narrowReference);
    const oldRestore = deferred<{ status: 'restored'; session: Session }>();
    vi.spyOn(AuthApplication, 'restorePersistedSession')
      .mockReturnValueOnce(oldRestore.promise)
      .mockResolvedValue({ status: 'reauth-required' });
    const restoring = AuthController.restorePersistedSession();
    const removing = AuthController.syncRemovedSession(narrowReference.sessionStoreId);
    await vi.waitFor(() => expect(useAuthStore.getState().session).toBeNull());
    // Allow removal's metadata read and epoch invalidation to settle before the old response arrives.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    oldRestore.resolve({ status: 'restored', session: narrowGrant });
    await Promise.all([restoring, removing]);
    expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'reauth-required' });
  });
});

describe('logout SDK lock deadline', () => {
  it('clears this tab when all localStorage writes fail', async () => {
    useSettingsStore.getState().setMutedUsers(['private-mute']);
    useLocksAuthStore.getState().init({ session: asOpaque({}), secret: 'old-lock-secret' });
    const sharedSettings = localStorage.getItem(SETTINGS_PERSIST_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError');
    });
    await AuthController.logout();
    expect(useAuthStore.getState()).toMatchObject({ session: null, currentUserPubky: null, sessionReference: null });
    expect(useLocksAuthStore.getState()).toMatchObject({ session: null, locksSessionSecret: null });
    expect(useSettingsStore.getState().muted).toEqual([]);
    expect(localStorage.getItem(SETTINGS_PERSIST_KEY)).toBe(sharedSettings);
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('bounds a stalled metadata lock and fences its late commit after a newer login', async () => {
    vi.useFakeTimers();
    useLocksAuthStore.getState().init({ session: asOpaque({}), secret: 'old-lock-secret' });
    const release: Array<() => void> = [];
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, callback: () => void) =>
          new Promise<void>((resolve, reject) => {
            release.push(() => {
              try {
                callback();
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          }),
      },
    });
    let finished = false;
    const logout = AuthController.logout().then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(5001);
    expect(finished).toBe(true);
    await logout;
    expect(useAuthStore.getState().session).toBeNull();
    expect(useLocksAuthStore.getState().session).toBeNull();
    expect(clearDatabase).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: async (_name: string, callback: () => void) => callback() },
    });
    const next = {
      ...AuthApplication.readPersistedAuth()!,
      generation: 'new-login',
      sessionReference: grantReference('new'),
    };
    await AuthApplication.commitPersistedAuth(next, '');
    useAuthStore.getState().init({ ...next, session: grantSession() });
    for (const callback of release) callback();
    await vi.advanceTimersByTimeAsync(1);
    expect(AuthApplication.readPersistedAuth()?.generation).toBe('new-login');
    expect(useAuthStore.getState().generation).toBe('new-login');
    expect(AuthApplication.logout).toHaveBeenCalledExactlyOnceWith({ session: narrowGrant });
  });
  it('clears this tab even when reading the failed transition also fails', async () => {
    vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValue(offline());
    vi.spyOn(AuthApplication, 'readPersistedAuth').mockImplementation(() => {
      throw offline();
    });
    useLocksAuthStore.getState().init({ session: asOpaque({}), secret: 'old-lock-secret' });
    await AuthController.logout();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useLocksAuthStore.getState().session).toBeNull();
  });
  it('finishes local cleanup when SDK removal is blocked after remote signout', async () => {
    vi.useFakeTimers();
    const removal = deferred<void>();
    vi.mocked(AuthApplication.removeSessionRecord).mockReturnValue(removal.promise);
    const logout = AuthController.logout();
    await vi.advanceTimersByTimeAsync(5001);
    expect(clearDatabase).toHaveBeenCalledOnce();
    await logout;
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toBeNull();
    removal.resolve();
  });
  it('does not remove a newly selected record when remote work finishes after the local deadline', async () => {
    vi.useFakeTimers();
    const revocation = deferred<void>();
    vi.mocked(AuthApplication.logout).mockReturnValue(revocation.promise);
    const logout = AuthController.logout();
    await vi.advanceTimersByTimeAsync(5001);
    await logout;
    const signedOutGeneration = useAuthStore.getState().generation;
    const replacement = {
      currentUserPubky: PUBKY,
      sessionReference: narrowReference,
      hasProfile: true,
      generation: 'replacement',
      retiringSession: null,
    };
    await expect(AuthApplication.commitPersistedAuth(replacement, signedOutGeneration)).rejects.toMatchObject({
      name: 'AuthFlowCanceled',
    });
    revocation.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(useAuthStore.getState().sessionReference).toBeNull();
  });
});

describe('retirement removal deadline', () => {
  it('leaves a stalled removal retryable during saved-session recovery', async () => {
    vi.useFakeTimers();
    seed(null, grantReference());
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({
        version: 3,
        state: { ...AuthApplication.readPersistedAuth()!, retiringSession: narrowReference },
      }),
    );
    useAuthStore.getState().setRetiringSession(narrowReference);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession(),
    });
    const removal = deferred<void>();
    vi.mocked(AuthApplication.removeSessionRecord).mockReturnValueOnce(removal.promise);
    let finished = false;
    const restore = AuthController.restorePersistedSession().then((result) => {
      finished = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(12001);
    expect(finished).toBe(true);
    expect(await restore).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      restoreStatus: 'ready',
      isRestoringSession: false,
      retiringSession: narrowReference,
    });
    expect(pendingRetirements(AuthApplication.readPersistedAuth()!)).toContainEqual(narrowReference);
    removal.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(pendingRetirements(AuthApplication.readPersistedAuth()!)).toEqual([]);
    expect(await AuthController.restorePersistedSession()).toBe(true);
    expect(useAuthStore.getState().retiringSession).toBeNull();
  });
  it('leaves a stalled removal retryable after permission adoption', async () => {
    vi.useFakeTimers();
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    const removal = deferred<void>();
    vi.mocked(AuthApplication.removeSessionRecord).mockReturnValueOnce(removal.promise);
    const outcome = result!.awaitApproval.catch((error: unknown) => error);
    flow.approval.resolve(grantSession());
    await vi.advanceTimersByTimeAsync(12001);
    expect(useAuthStore.getState()).toMatchObject({
      restoreStatus: 'ready',
      pendingRetirements: [narrowReference],
    });
    expect(await outcome).toBeDefined();
    removal.resolve();
    await AuthController.retrySessionRetirement();
    expect(useAuthStore.getState().retiringSession).toBeNull();
  });
});

describe('account ownership across asynchronous cleanup', () => {
  it.each([false, true])(
    'does not reset a newer account when database cleanup finishes (rehydrated=%s)',
    async (rehydrated) => {
      seed(null, null);
      const clear = deferred<void>();
      vi.mocked(clearDatabase).mockReturnValueOnce(clear.promise);
      const flow = startFlow();
      const result = await AuthController.getAuthUrl();
      flow.approval.resolve(grantSession());
      await vi.waitFor(() => expect(clearDatabase).toHaveBeenCalled());
      const next = {
        currentUserPubky: OTHER_PUBKY,
        sessionReference: grantReference('new-account'),
        retiringSession: null,
        hasProfile: true,
        generation: 'new-account',
      };
      await AuthApplication.commitPersistedAuth(next, useAuthStore.getState().generation);
      if (rehydrated) useAuthStore.getState().init({ ...next, session: grantSession([APP_CAPABILITIES], OTHER_PUBKY) });
      useSettingsStore.getState().setMutedUsers(['new-account-mute']);
      const settings = localStorage.getItem(SETTINGS_PERSIST_KEY);
      clear.resolve();
      await expect(result.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
      expect(useSettingsStore.getState().muted).toEqual(['new-account-mute']);
      expect(localStorage.getItem(SETTINGS_PERSIST_KEY)).toBe(settings);
      expect(AuthApplication.userIsSignedUp).not.toHaveBeenCalled();
      expect(AuthApplication.logout).not.toHaveBeenCalled();
    },
  );
  it.each([null, OTHER_PUBKY])('clears only this tab Locks session when the account changes to %s', async (pubky) => {
    useLocksAuthStore.getState().init({ session: asOpaque({}), secret: 'old-lock-secret' });
    useLocksAuthStore.getState().setPaykitConnected(true);
    const sharedLocks = JSON.stringify({
      version: 0,
      state: { locksSessionSecret: 'new-lock-secret', hasHydrated: false },
    });
    localStorage.setItem(LOCKS_AUTH_PERSIST_KEY, sharedLocks);
    await AuthApplication.commitPersistedAuth(
      {
        currentUserPubky: pubky,
        sessionReference: pubky ? grantReference('new') : null,
        retiringSession: null,
        hasProfile: pubky ? true : null,
        generation: 'other-tab',
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession([APP_CAPABILITIES], OTHER_PUBKY),
    });
    await AuthController.syncSessionFromStorage();
    expect(useLocksAuthStore.getState()).toMatchObject({
      session: null,
      locksSessionSecret: pubky ? 'new-lock-secret' : null,
      paykitConnected: false,
    });
    expect(JSON.parse(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY)!)).toEqual(JSON.parse(sharedLocks));
  });
});

describe('legacy cookie logout cleanup', () => {
  it.each(['v1', 'v2'])(
    'revokes the retained public identity after %s migration without restoring a cookie',
    async (version) => {
      useAuthStore.setState(authInitialState);
      localStorage.clear();
      localStorage.setItem(
        version === 'v1' ? LEGACY_AUTH_PERSIST_KEY : PREVIOUS_AUTH_PERSIST_KEY,
        JSON.stringify({
          version: version === 'v1' ? 1 : 2,
          state: {
            currentUserPubky: PUBKY,
            hasProfile: true,
            generation: 'legacy',
            sessionExport: 'old-export',
            sessionReference: { kind: 'cookie', sessionExport: 'old-export' },
            retiringSession: null,
          },
        }),
      );
      await useAuthStore.persist.rehydrate();
      await AuthController.logout();
      expect(AuthApplication.logoutLegacyCookie).toHaveBeenCalledExactlyOnceWith(PUBKY);
      expect(AuthApplication.restoreReference).not.toHaveBeenCalled();
      expect(useAuthStore.getState().currentUserPubky).toBeNull();
    },
  );
  it('attempts cookie cleanup independently when grant revocation fails', async () => {
    vi.mocked(AuthApplication.logout).mockRejectedValue(offline());
    await AuthController.logout();
    expect(AuthApplication.logoutLegacyCookie).toHaveBeenCalledExactlyOnceWith(PUBKY);
    expect(clearDatabase).toHaveBeenCalledOnce();
  });
  it('bounds cookie cleanup and still revokes the grant if cookie cleanup stalls', async () => {
    vi.useFakeTimers();
    vi.mocked(AuthApplication.logoutLegacyCookie).mockReturnValue(deferred<never>().promise);
    const logout = AuthController.logout();
    await vi.advanceTimersByTimeAsync(5001);
    await logout;
    expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowGrant });
    expect(clearDatabase).toHaveBeenCalledOnce();
  });
  it('reports cookie cleanup failure while still clearing local state and revoking the grant', async () => {
    const warn = vi.spyOn(Logger, 'warn');
    vi.mocked(AuthApplication.logoutLegacyCookie).mockRejectedValue(offline());
    await AuthController.logout();
    expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowGrant });
    expect(useAuthStore.getState().session).toBeNull();
    expect(clearDatabase).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Local sign-out completed; remote revocation could not be confirmed.');
  });
  it('skips remote cookie cleanup when there is no retained account identity', async () => {
    seed(null, null);
    await AuthController.logout();
    expect(AuthApplication.logoutLegacyCookie).not.toHaveBeenCalled();
  });
});

describe('Locks restore ownership after account changes', () => {
  async function switchAccount(pubky: string | null) {
    const sharedLocks =
      pubky === PUBKY
        ? localStorage.getItem(LOCKS_AUTH_PERSIST_KEY)!
        : JSON.stringify({ version: 0, state: { locksSessionSecret: 'new-lock-secret', hasHydrated: false } });
    localStorage.setItem(LOCKS_AUTH_PERSIST_KEY, sharedLocks);
    await AuthApplication.commitPersistedAuth(
      {
        currentUserPubky: pubky,
        sessionReference: pubky ? grantReference('new') : null,
        retiringSession: null,
        hasProfile: pubky ? true : null,
        generation: 'other-tab',
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession([APP_CAPABILITIES], pubky ?? OTHER_PUBKY),
    });
    await AuthController.syncSessionFromStorage();
    return sharedLocks;
  }

  it.each([null, OTHER_PUBKY])('does not restore an old Locks handle after switching to %s', async (pubky) => {
    useLocksAuthStore.getState().init({ session: null, secret: 'old-lock-secret' });
    const pending = deferred<LocksSession>();
    vi.spyOn(LocksApplication, 'restoreSession').mockReturnValue(pending.promise);
    const config = vi.spyOn(LocksApplication, 'setLockServiceConfig').mockResolvedValue(undefined);
    const restoring = LocksController.restorePersistedLocksSession();
    const sharedLocks = await switchAccount(pubky);
    pending.resolve(asOpaque({}));
    await restoring;
    expect(useLocksAuthStore.getState().session).toBeNull();
    expect(JSON.parse(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY)!)).toEqual(JSON.parse(sharedLocks));
    expect(config).not.toHaveBeenCalled();
  });

  it.each(['restore', 'validation'])(
    'does not clear a newer shared Locks secret after stale %s failure',
    async (stage) => {
      useLocksAuthStore.getState().init({ session: null, secret: 'old-lock-secret' });
      const restore = deferred<LocksSession>();
      const validation = deferred<void>();
      vi.spyOn(LocksApplication, 'restoreSession').mockReturnValue(restore.promise);
      const config = vi.spyOn(LocksApplication, 'setLockServiceConfig').mockReturnValue(validation.promise);
      const restoring = LocksController.restorePersistedLocksSession();
      if (stage === 'validation') {
        restore.resolve(asOpaque({ creatorPubky: () => PUBKY }));
        await vi.waitFor(() => expect(config).toHaveBeenCalled());
      }
      const sharedLocks = await switchAccount(OTHER_PUBKY);
      if (stage === 'restore') restore.reject(expired());
      else validation.reject(expired());
      await restoring;
      expect(useLocksAuthStore.getState().session).toBeNull();
      expect(JSON.parse(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY)!)).toEqual(JSON.parse(sharedLocks));
    },
  );

  it('retries Locks restoration for a newer grant without accepting the stale pending result', async () => {
    useLocksAuthStore.getState().init({ session: null, secret: 'same-lock-secret' });
    const pending = deferred<LocksSession>();
    vi.spyOn(LocksApplication, 'restoreSession').mockReturnValue(pending.promise);
    const config = vi.spyOn(LocksApplication, 'setLockServiceConfig').mockResolvedValue(undefined);
    const restoring = LocksController.restorePersistedLocksSession();
    await switchAccount(PUBKY);
    const session = asOpaque<LocksSession>({ creatorPubky: () => PUBKY });
    pending.resolve(session);
    await restoring;
    expect(useLocksAuthStore.getState().session).toBeNull();
    // useRestoreLocksAuth retries after the auth generation changes.
    await LocksController.restorePersistedLocksSession();
    expect(useLocksAuthStore.getState()).toMatchObject({ session, locksSessionSecret: 'same-lock-secret' });
    expect(config).toHaveBeenCalledOnce();
  });
});

describe('Passport same-account recovery', () => {
  it.each([PUBKY, OTHER_PUBKY])(
    'binds recovered Passport approval to the retained account (%s)',
    async (approvedPubky) => {
      seed(null, null);
      useAuthStore
        .getState()
        .init({ currentUserPubky: PUBKY, session: null, sessionReference: null, generation: '', hasProfile: true });
      localStorage.setItem(
        AUTH_PERSIST_KEY,
        JSON.stringify({
          version: 3,
          state: {
            currentUserPubky: PUBKY,
            sessionReference: null,
            generation: '',
            hasProfile: true,
            retiringSession: null,
          },
        }),
      );
      const flow = startFlow();
      const result = await AuthController.getPassportAuthUrl({ xCallback: { xSource: 'Pubky' } });
      const approved = grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], approvedPubky);
      flow.approval.resolve(approved);
      if (approvedPubky === OTHER_PUBKY) {
        await result.awaitApproval;
        await expect(AuthController.initializeAuthenticatedSession({ session: approved })).rejects.toMatchObject({
          name: 'AuthApprovalMismatch',
        });
        expect(AuthApplication.saveSession).not.toHaveBeenCalled();
        expect(useAuthStore.getState()).toMatchObject({
          currentUserPubky: PUBKY,
          session: null,
          restoreStatus: 'reauth-required',
        });
      } else {
        await result.awaitApproval;
        await AuthController.initializeAuthenticatedSession({ session: approved });
        expect(useAuthStore.getState()).toMatchObject({
          currentUserPubky: PUBKY,
          session: approved,
          restoreStatus: 'ready',
        });
      }
      expect(clearDatabase).not.toHaveBeenCalled();
    },
  );
  it('recognizes when SDK restore already completed pending remote logout', async () => {
    seed(null, narrowReference);
    const warn = vi.spyOn(Logger, 'warn');
    vi.mocked(AuthApplication.restoreReference).mockRejectedValue(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Already signed out', {
        service: ErrorService.Homeserver,
        operation: 'restoreGrant',
        context: { reason: 'remote_logout_completed' },
      }),
    );
    await AuthController.logout();
    expect(AuthApplication.logout).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalledWith('Local sign-out completed; remote revocation could not be confirmed.');
    expect(clearDatabase).toHaveBeenCalledOnce();
  });
});

describe('reviewed account lifecycle boundaries', () => {
  it('clears this tab and suppresses discarded credentials when the logout write fails', async () => {
    const commit = vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValueOnce(offline());
    useLocksAuthStore.getState().init({ session: asOpaque({ creatorPubky: () => PUBKY }), secret: 'old-locks-secret' });
    vi.spyOn(LocksApplication, 'signout').mockResolvedValue(undefined);
    await AuthController.logout();
    expect(useAuthStore.getState()).toMatchObject({ session: null, sessionReference: null, currentUserPubky: null });
    expect(useLocksAuthStore.getState().session).toBeNull();
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().sessionReference).toBeNull();
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toBeNull();
    expect(clearDatabase).not.toHaveBeenCalled();
    commit.mockRestore();
    const flow = startFlow();
    const login = await AuthController.getAuthUrl();
    flow.approval.resolve(grantSession());
    await login.awaitApproval;
    expect(useAuthStore.getState().sessionReference?.grantId).toBe('grant');
  });

  it('bounds a queued logout commit and fences its callback after a newer login', async () => {
    vi.useFakeTimers();
    const callbacks: Array<() => void> = [];
    vi.spyOn(navigator.locks, 'request').mockImplementation(
      (...args: unknown[]) =>
        new Promise((resolve, reject) => {
          const callback = args.at(-1) as () => void;
          callbacks.push(() => {
            try {
              resolve(callback());
            } catch (error) {
              reject(error);
            }
          });
        }),
    );
    let finished = false;
    const logout = AuthController.logout().then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(5001);
    try {
      expect(finished).toBe(true);
      expect(useAuthStore.getState().session).toBeNull();
      const newer = {
        generation: 'after-logout-timeout',
        currentUserPubky: OTHER_PUBKY,
        hasProfile: true,
        sessionReference: grantReference('newer'),
        retiringSession: null,
      };
      localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state: newer }));
      useAuthStore.getState().init({ ...newer, session: grantSession([APP_CAPABILITIES], OTHER_PUBKY) });
      for (const callback of callbacks) callback();
      await vi.advanceTimersByTimeAsync(0);
      expect(AuthApplication.readPersistedAuth()?.generation).toBe(newer.generation);
    } finally {
      for (const callback of callbacks) callback();
      await logout;
    }
  });

  it('does not carry previous-account preferences into recovery after database cleanup fails', async () => {
    useSettingsStore.getState().setMutedUsers(['previous-account-only']);
    vi.mocked(clearDatabase).mockRejectedValueOnce(offline());
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], OTHER_PUBKY));
    await expect(result.awaitApproval).rejects.toThrow();
    expect(useAuthStore.getState().restoreStatus).toBe('temporary-error');
    vi.mocked(AuthApplication.userIsSignedUp).mockResolvedValue(true);
    await AuthController.restorePersistedSession();
    expect(SettingsApplication.initializeSettings).toHaveBeenCalledWith(
      OTHER_PUBKY,
      expect.objectContaining({ muted: [] }),
    );
  });
  it('stays signed out when auth storage cannot be read or written during logout and rehydration', async () => {
    useLocksAuthStore.getState().init({ session: asOpaque({ creatorPubky: () => PUBKY }), secret: 'old-secret' });
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === AUTH_PERSIST_KEY) throw new DOMException('Storage blocked', 'SecurityError');
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === AUTH_PERSIST_KEY) throw new DOMException('Storage blocked', 'SecurityError');
      setItem.call(this, key, value);
    });
    await AuthController.logout();
    await useAuthStore.persist.rehydrate();
    await AuthController.syncSessionFromStorage();
    expect(useAuthStore.getState()).toMatchObject({ currentUserPubky: null, session: null, restoreStatus: 'idle' });
    expect(useLocksAuthStore.getState().session).toBeNull();
  });

  it('bounds retired SDK record removal and preserves the reference for retry', async () => {
    vi.useFakeTimers();
    const removal = deferred<void>();
    vi.mocked(AuthApplication.removeSessionRecord).mockReturnValue(removal.promise);
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    let settled = false;
    const outcome = result!.awaitApproval
      .catch((error: unknown) => error)
      .finally(() => {
        settled = true;
      });
    flow.approval.resolve(grantSession());
    try {
      await vi.advanceTimersByTimeAsync(12_001);
      expect(settled).toBe(true);
      expect(useAuthStore.getState()).toMatchObject({
        pendingRetirements: [narrowReference],
        restoreStatus: 'ready',
      });
    } finally {
      removal.resolve();
      await outcome;
    }
  });

  it('does not reset a newer account after an old adoption finishes clearing its database', async () => {
    const clearing = deferred<void>();
    vi.mocked(clearDatabase).mockReturnValueOnce(clearing.promise);
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    const outcome = result.awaitApproval.catch((error: unknown) => error);
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], OTHER_PUBKY));
    await vi.waitFor(() => expect(clearDatabase).toHaveBeenCalledOnce());
    const newer = {
      generation: 'newer-account',
      currentUserPubky: PUBKY,
      hasProfile: true,
      sessionReference: grantReference('newer'),
      retiringSession: null,
    };
    await AuthApplication.commitPersistedAuth(newer, useAuthStore.getState().generation);
    useAuthStore.getState().init({ ...newer, session: grantSession() });
    useSettingsStore.getState().setMutedUsers(['newer-account-mute']);
    const savedSettings = localStorage.getItem(SETTINGS_PERSIST_KEY);
    clearing.resolve();
    await expect(outcome).resolves.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(useSettingsStore.getState().muted).toEqual(['newer-account-mute']);
    expect(localStorage.getItem(SETTINGS_PERSIST_KEY)).toBe(savedSettings);
    expect(AuthApplication.logout).not.toHaveBeenCalled();
    expect(AuthApplication.userIsSignedUp).not.toHaveBeenCalled();
  });

  it.each([null, OTHER_PUBKY])('detaches the old Locks account on cross-tab account change to %s', async (pubky) => {
    useLocksAuthStore.getState().init({ session: asOpaque({ creatorPubky: () => PUBKY }), secret: 'old-locks-secret' });
    const newerLocks = JSON.stringify({
      state: { locksSessionSecret: 'newer-locks-secret', hasHydrated: false },
      version: 0,
    });
    localStorage.setItem(LOCKS_AUTH_PERSIST_KEY, newerLocks);
    await AuthApplication.commitPersistedAuth(
      {
        generation: 'cross-tab-change',
        currentUserPubky: pubky,
        hasProfile: pubky ? true : null,
        sessionReference: pubky ? grantReference('newer') : null,
        retiringSession: null,
      },
      '',
    );
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'reauth-required' });
    await AuthController.syncSessionFromStorage();
    expect(useLocksAuthStore.getState().session).toBeNull();
    expect(useLocksAuthStore.getState().locksSessionSecret).not.toBe('old-locks-secret');
    expect(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY)).toBe(newerLocks);
  });

  it('does not clear a newer account database or Locks secret after old Locks signout settles', async () => {
    const signout = deferred<void>();
    useLocksAuthStore.getState().init({ session: asOpaque({ creatorPubky: () => PUBKY }), secret: 'old-locks-secret' });
    vi.spyOn(LocksApplication, 'signout').mockReturnValue(signout.promise);
    const logout = AuthController.logout();
    await vi.waitFor(() => expect(LocksApplication.signout).toHaveBeenCalledOnce());
    const newer = {
      generation: 'newer-during-locks-signout',
      currentUserPubky: OTHER_PUBKY,
      hasProfile: true,
      sessionReference: grantReference('newer'),
      retiringSession: null,
    };
    await AuthApplication.commitPersistedAuth(newer, useAuthStore.getState().generation);
    useAuthStore.getState().init({ ...newer, session: grantSession([APP_CAPABILITIES], OTHER_PUBKY) });
    useLocksAuthStore
      .getState()
      .init({ session: asOpaque({ creatorPubky: () => OTHER_PUBKY }), secret: 'newer-locks-secret' });
    const savedLocks = localStorage.getItem(LOCKS_AUTH_PERSIST_KEY);
    const clearCount = vi.mocked(clearDatabase).mock.calls.length;
    signout.resolve();
    await expect(logout).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(vi.mocked(clearDatabase).mock.calls).toHaveLength(clearCount);
    expect(useLocksAuthStore.getState().locksSessionSecret).toBe('newer-locks-secret');
    expect(localStorage.getItem(LOCKS_AUTH_PERSIST_KEY)).toBe(savedLocks);
  });
});

describe('bounded previous cookie retirement', () => {
  it('tries old cookie revocation even when reauthorization has no grant to restore', async () => {
    seed(null, null);
    await AuthController.restorePersistedSession();
    expect(AuthApplication.revokeLegacyCookieSessions).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().session).toBeNull();
  });
  it('retries old cookies during explicit logout without skipping grant revocation', async () => {
    vi.mocked(AuthApplication.revokeLegacyCookieSessions).mockRejectedValueOnce(offline());
    await AuthController.logout();
    expect(AuthApplication.revokeLegacyCookieSessions).toHaveBeenCalledOnce();
    expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowGrant });
    expect(useAuthStore.getState().session).toBeNull();
  });
  it('finishes local logout when old cookie revocation stalls', async () => {
    vi.useFakeTimers();
    const pending = deferred<void>();
    vi.mocked(AuthApplication.revokeLegacyCookieSessions).mockReturnValueOnce(pending.promise);
    const logout = AuthController.logout();
    void logout.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_001);
    await logout;
    expect(useAuthStore.getState()).toMatchObject({ session: null, currentUserPubky: null, restoreStatus: 'idle' });
    expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowGrant });
    pending.resolve();
    await pending.promise;
  });
});

describe('account preparation recovery', () => {
  it('finishes a timed-out database cleanup before restoring account data', async () => {
    vi.useFakeTimers();
    const opening = deferred<void>();
    const rows = new Set(['previous-account']);
    vi.mocked(clearDatabase).mockImplementationOnce(async (isCurrent) => {
      await opening.promise;
      if (isCurrent?.()) rows.clear();
    });
    vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockResolvedValue(true);
    vi.mocked(BootstrapApplication.initialize).mockImplementation(async () => {
      rows.add('restored-account');
      return { unread: 0, lastRead: 0, lastPolledTimestamp: undefined };
    });
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    const adoption = result.awaitApproval.catch((error: unknown) => error);
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], OTHER_PUBKY));
    await vi.advanceTimersByTimeAsync(12_001);
    await adoption;
    expect(useAuthStore.getState().restoreStatus).toBe('temporary-error');

    const retry = AuthController.restorePersistedSession();
    await vi.advanceTimersByTimeAsync(1);
    const stateWhileOpening = useAuthStore.getState().restoreStatus;
    const bootstrappedWhileOpening = vi.mocked(BootstrapApplication.initialize).mock.calls.length > 0;
    opening.resolve();
    expect(await retry).toBe(true);

    expect(stateWhileOpening).toBe('restoring');
    expect(bootstrappedWhileOpening).toBe(false);
    expect(clearDatabase).toHaveBeenCalledOnce();
    expect([...rows]).toEqual(['restored-account']);
    expect(useAuthStore.getState().restoreStatus).toBe('ready');
  });

  it('retries a failed database cleanup before bootstrapping the saved replacement account', async () => {
    const rows = new Set(['previous-account']);
    vi.mocked(clearDatabase)
      .mockRejectedValueOnce(offline())
      .mockImplementationOnce(async () => rows.clear());
    vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockResolvedValue(true);
    vi.mocked(BootstrapApplication.initialize).mockImplementation(async () => {
      rows.add('restored-account');
      return { unread: 0, lastRead: 0, lastPolledTimestamp: undefined };
    });
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    const adoption = expect(result.awaitApproval).rejects.toMatchObject({ code: NetworkErrorCode.CONNECTION_FAILED });
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], OTHER_PUBKY));
    await adoption;

    expect(await AuthController.restorePersistedSession()).toBe(true);
    expect(clearDatabase).toHaveBeenCalledTimes(2);
    expect([...rows]).toEqual(['restored-account']);
  });

  it('keeps retry bounded without starting another cleanup while the first one is pending', async () => {
    vi.useFakeTimers();
    const opening = deferred<void>();
    vi.mocked(clearDatabase).mockReturnValueOnce(opening.promise);
    vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockResolvedValue(true);
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    const adoption = result.awaitApproval.catch((error: unknown) => error);
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES], OTHER_PUBKY));
    await vi.advanceTimersByTimeAsync(12_001);
    await adoption;

    const retry = AuthController.restorePersistedSession();
    await vi.advanceTimersByTimeAsync(12_001);
    const restoredWhileOpening = await retry;
    const stateWhileOpening = useAuthStore.getState().restoreStatus;
    const bootstrappedWhileOpening = vi.mocked(BootstrapApplication.initialize).mock.calls.length > 0;
    opening.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(await AuthController.restorePersistedSession()).toBe(true);

    expect(restoredWhileOpening).toBe(false);
    expect(stateWhileOpening).toBe('temporary-error');
    expect(bootstrappedWhileOpening).toBe(false);
    expect(clearDatabase).toHaveBeenCalledOnce();
  });
});

it('restores unfinished preparation from durable metadata without an in-memory cleanup task', async () => {
  seed(null);
  vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session: narrowGrant });
  await AuthApplication.commitPersistedAuth(
    { ...AuthApplication.readPersistedAuth()!, needsAccountPreparation: true },
    '',
  );
  vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockResolvedValue(true);
  expect(await AuthController.restorePersistedSession()).toBe(true);
  expect(clearDatabase).toHaveBeenCalledOnce();
  expect(BootstrapApplication.initialize).toHaveBeenCalledOnce();
  expect(AuthApplication.readPersistedAuth()?.needsAccountPreparation).toBe(false);
});

it('carries unfinished preparation into a same-account replacement and bootstraps after cleanup', async () => {
  seed(null);
  useAuthStore.getState().setRestoreStatus('reauth-required');
  await AuthApplication.commitPersistedAuth(
    { ...AuthApplication.readPersistedAuth()!, needsAccountPreparation: true },
    '',
  );
  vi.mocked(AuthApplication.userIsSignedUp).mockResolvedValue(true);
  const flow = startFlow();
  const result = await AuthController.getAuthUrl();
  flow.approval.resolve(grantSession());
  await result.awaitApproval;
  expect(clearDatabase).toHaveBeenCalledOnce();
  expect(BootstrapApplication.initialize).toHaveBeenCalledOnce();
  expect(AuthApplication.readPersistedAuth()?.needsAccountPreparation).toBe(false);
  expect(useAuthStore.getState().restoreStatus).toBe('ready');
});

describe('review regression coverage', () => {
  it('keeps a valid replacement ready and retains every failed predecessor across successive upgrades', async () => {
    vi.mocked(AuthApplication.logout).mockRejectedValue(offline());
    for (const id of ['second', 'third']) {
      vi.mocked(AuthApplication.saveSession).mockResolvedValue(grantReference(id));
      const flow = startFlow();
      const result = await AuthController.getAuthUrl(true);
      flow.approval.resolve(grantSession(undefined, PUBKY, id));
      await result.awaitApproval;
      await AuthController.retrySessionRetirement();
      expect(useAuthStore.getState().restoreStatus).toBe('ready');
      expect(AuthController.hasCapabilities(LOCKS_CAPABILITIES)).toBe(true);
    }
    expect(pendingRetirements(AuthApplication.readPersistedAuth()!).map((ref) => ref.grantId)).toEqual([
      'second',
      narrowReference.grantId,
    ]);
  });

  it('tries every logout revocation and keeps only unsuccessful credentials for a later retry', async () => {
    const previous = grantReference('previous');
    const active = grantReference('active');
    seed(grantSession(undefined, PUBKY, 'active'), active);
    const stored = { ...AuthApplication.readPersistedAuth()!, retiringSession: previous };
    localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state: stored }));
    useAuthStore.getState().setRetiringSession(previous);
    vi.mocked(AuthApplication.restoreReference).mockResolvedValue(grantSession(undefined, PUBKY, 'previous'));
    vi.mocked(AuthApplication.logout).mockImplementation(async ({ session }) => {
      if ((await session.grant!.sessionInfo()).grantId === 'active') throw offline();
    });
    await AuthController.logout();
    expect(AuthApplication.logout).toHaveBeenCalledTimes(2);
    expect(pendingRetirements(AuthApplication.readPersistedAuth()!)).toEqual([active]);
    expect(AuthApplication.removeSessionRecord).not.toHaveBeenCalledWith(active);
    expect(useAuthStore.getState()).toMatchObject({ session: null, isLoggingOut: false });
    vi.mocked(AuthApplication.logout).mockResolvedValue(undefined);
    await AuthController.retrySessionRetirement();
    expect(pendingRetirements(AuthApplication.readPersistedAuth()!)).toEqual([]);
  });

  it('joins timed-out bootstrap on retry and accepts its late success exactly once', async () => {
    vi.useFakeTimers();
    seed(null, null);
    const profile = deferred<boolean>();
    vi.mocked(AuthApplication.userIsSignedUp).mockReturnValue(profile.promise);
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    const first = result.awaitApproval.catch((error: unknown) => error);
    flow.approval.resolve(grantSession());
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await first).toMatchObject({
      service: ErrorService.Homeserver,
      operation: 'bootstrapProfile',
      message: 'Your session is saved, but account data is still loading. Try again.',
    });
    expect(useAuthStore.getState().restoreStatus).toBe('temporary-error');
    const retry = AuthController.restorePersistedSession();
    await vi.advanceTimersByTimeAsync(1);
    profile.resolve(false);
    expect(await retry).toBe(true);
    expect(AuthApplication.userIsSignedUp).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({ restoreStatus: 'ready', hasProfile: false });
  });

  it('recovers from a bootstrap deadline when the original task finishes without another click', async () => {
    vi.useFakeTimers();
    seed(null, null);
    const profile = deferred<boolean>();
    vi.mocked(AuthApplication.userIsSignedUp).mockReturnValue(profile.promise);
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    const first = result.awaitApproval.catch(() => {});
    flow.approval.resolve(grantSession());
    await vi.advanceTimersByTimeAsync(12_001);
    await first;
    profile.resolve(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(useAuthStore.getState().restoreStatus).toBe('ready');
  });

  it('does not cancel a saved-session restore when a pending Passport flow is canceled', async () => {
    seed(null);
    useAuthStore.getState().setRestoreStatus('temporary-error');
    startFlow();
    const passport = await AuthController.getPassportAuthUrl({ xCallback: { xSource: 'Pubky' } });
    const restored = deferred<{ status: 'restored'; session: Session }>();
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(restored.promise);
    const retry = AuthController.restorePersistedSession();
    passport.cancelAuthFlow();
    restored.resolve({ status: 'restored', session: narrowGrant });
    expect(await retry).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({ restoreStatus: 'ready', isRestoringSession: false });
  });

  it('settles a lost logout compare-and-swap as canceled and leaves the newer account usable', async () => {
    vi.spyOn(AuthApplication, 'commitPersistedAuth').mockImplementationOnce(async () => {
      localStorage.setItem(
        AUTH_PERSIST_KEY,
        JSON.stringify({
          version: 3,
          state: {
            currentUserPubky: PUBKY,
            hasProfile: true,
            sessionReference: grantReference('newer'),
            retiringSession: null,
            generation: 'newer',
          },
        }),
      );
      throw createCanceledError();
    });
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session: grantSession(),
    });
    await expect(AuthController.logout()).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(useAuthStore.getState()).toMatchObject({ generation: 'newer', isLoggingOut: false, restoreStatus: 'ready' });
    expect(clearDatabase).not.toHaveBeenCalled();
  });

  it('does not turn completed credential logout into a failed logout when cache clearing times out', async () => {
    vi.useFakeTimers();
    const cleanup = deferred<void>();
    vi.mocked(clearDatabase).mockReturnValue(cleanup.promise);
    const logout = AuthController.logout();
    void logout.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(logout).resolves.toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({ session: null, currentUserPubky: null, isLoggingOut: false });
    cleanup.resolve();
  });

  it('does not mark a terminal recovery state busy after a same-generation hydration', async () => {
    seed(null);
    useAuthStore.getState().setRestoreStatus('temporary-error');
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState()).toMatchObject({ restoreStatus: 'temporary-error', isRestoringSession: false });
  });

  it('clears a definitively rejected invite attempt while retaining the original signup keys', async () => {
    seed(null, null);
    const secrets = Identity.generateSecrets();
    useOnboardingStore.getState().setSecrets(secrets);
    vi.spyOn(AuthApplication, 'createAccount').mockRejectedValue(expired());
    await expect(AuthController.signUp({ secretKey: secrets.secretKey, signupToken: 'invalid' })).rejects.toBeDefined();
    expect(useOnboardingStore.getState()).toMatchObject({ ...secrets, signupAttempt: null });
  });

  it('prepares account data after the real browser signup key generator preselects the identity', async () => {
    seed(null, null);
    useSettingsStore.setState({ privacy: { ...settingsInitialState.privacy, moderationBot: OTHER_PUBKY } });
    ProfileController.generateSecrets();
    const secretKey = useOnboardingStore.getState().secretKey!;
    const pubky = Identity.z32FromSecret(secretKey);
    expect(useAuthStore.getState().currentUserPubky).toBe(pubky);
    vi.spyOn(AuthApplication, 'createAccount').mockResolvedValue(undefined);
    vi.spyOn(AuthApplication, 'signInCreatedAccount').mockResolvedValue({ session: grantSession(['/:rw'], pubky) });
    await AuthController.signUp({ secretKey, signupToken: 'invite' });
    expect(clearDatabase).toHaveBeenCalledOnce();
    expect(useSettingsStore.getState().privacy.moderationBot).toBe(settingsInitialState.privacy.moderationBot);
    expect(useOnboardingStore.getState().secretKey).toBe(secretKey);
  });
});

it('regression: next login retains revocations after failed durable logout', async () => {
  vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValueOnce(offline());
  vi.mocked(AuthApplication.logout).mockRejectedValue(offline());
  await AuthController.logout();
  expect(pendingRetirements(useAuthStore.getState())).toEqual([narrowReference]);
  const flow = startFlow();
  const login = await AuthController.getAuthUrl();
  flow.approval.resolve(grantSession());
  await login.awaitApproval;
  expect(pendingRetirements(AuthApplication.readPersistedAuth()!)).toEqual([narrowReference]);
  expect(AuthApplication.logout).toHaveBeenCalledTimes(2);
});

it('regression: canceled new QR flow does not strand the SDK removal recheck', async () => {
  seed(null);
  const restored = deferred<{ status: 'restored'; session: Session }>();
  vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(restored.promise);
  const restoring = AuthController.restorePersistedSession();
  const removal = AuthController.syncRemovedSession(narrowReference.sessionStoreId);
  await vi.waitFor(() => expect(useAuthStore.getState().session).toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 0));
  startFlow();
  const passport = await AuthController.getPassportAuthUrl({ xCallback: { xSource: 'Pubky' } });
  passport.cancelAuthFlow();
  restored.resolve({ status: 'restored', session: narrowGrant });
  await restoring;
  await removal;
  expect(useAuthStore.getState()).toMatchObject({
    session: narrowGrant,
    restoreStatus: 'ready',
    isRestoringSession: false,
  });
  expect(AuthApplication.restorePersistedSession).toHaveBeenCalledTimes(2);
});

it('regression: retry with newly readable empty storage returns to idle', async () => {
  seed(null, null);
  localStorage.clear();
  useAuthStore.getState().setRestoreStatus('temporary-error');
  await AuthController.restorePersistedSession();
  expect(useAuthStore.getState()).toMatchObject({ restoreStatus: 'idle', isRestoringSession: false });
});

it('regression: concurrent hydration retries join one restore', async () => {
  seed(null);
  useAuthStore.setState({
    sessionReference: null,
    currentUserPubky: null,
    hasProfile: null,
    restoreStatus: 'temporary-error',
  });
  localStorage.setItem(
    AUTH_PERSIST_KEY,
    JSON.stringify({
      version: 3,
      state: {
        generation: '',
        currentUserPubky: PUBKY,
        sessionReference: narrowReference,
        hasProfile: null,
        retiringSession: null,
      },
    }),
  );
  vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session: narrowGrant });
  const profile = deferred<boolean>();
  vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockReturnValue(profile.promise);
  const first = AuthController.restorePersistedSession();
  const second = AuthController.restorePersistedSession();
  await vi.waitFor(() => expect(AuthApplication.resolveUserIsSignedUp).toHaveBeenCalledOnce());
  profile.resolve(false);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(AuthApplication.restorePersistedSession).toHaveBeenCalledOnce();
  expect(AuthApplication.resolveUserIsSignedUp).toHaveBeenCalledOnce();
  expect(useAuthStore.getState()).toMatchObject({ session: narrowGrant, hasProfile: false, restoreStatus: 'ready' });
});

it('regression: logout cannot replace a newer account after its commit resolves', async () => {
  const commit = AuthApplication.commitPersistedAuth.bind(AuthApplication);
  const newerSession = grantSession([APP_CAPABILITIES], OTHER_PUBKY, 'newer');
  const newer = {
    currentUserPubky: OTHER_PUBKY,
    hasProfile: true,
    sessionReference: grantReference('newer'),
    retiringSession: null,
    pendingRetirements: [],
    generation: 'newer-after-logout-commit',
  };
  vi.spyOn(AuthApplication, 'commitPersistedAuth').mockImplementationOnce(async (...args) => {
    await commit(...args);
    // Another tab wins after the logout lock is released and before local adoption.
    localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state: newer }));
    useAuthStore.getState().init({ ...newer, session: newerSession });
  });
  await expect(AuthController.logout()).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
  expect(useAuthStore.getState()).toMatchObject({
    ...newer,
    session: newerSession,
    restoreStatus: 'ready',
    isLoggingOut: false,
  });
  expect(clearDatabase).not.toHaveBeenCalled();
});

it('shares a single deadline for concurrent and late legacy cleanup callers', async () => {
  vi.useFakeTimers();
  const remote = deferred<void>();
  vi.mocked(AuthApplication.revokeLegacyCookieSessions).mockReturnValue(remote.promise);
  const timeout = vi.spyOn(Err, 'timeout');
  const first = AuthController.retireLegacyCookieSessions();
  const second = AuthController.retireLegacyCookieSessions();
  await vi.advanceTimersByTimeAsync(5_001);
  await Promise.all([first, second, AuthController.retireLegacyCookieSessions()]);
  expect(AuthApplication.revokeLegacyCookieSessions).toHaveBeenCalledOnce();
  expect(timeout).toHaveBeenCalledOnce();
  remote.resolve();
  await vi.advanceTimersByTimeAsync(1);
});

describe('final review session ownership regressions', () => {
  it.each([false, true])('shares an exchange across UI timeouts (settled before retry: %s)', async (settled) => {
    vi.useFakeTimers();
    seed(null);
    const exchange = deferred<{ status: 'restored'; session: Session }>();
    const restore = vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(exchange.promise);
    const initial = AuthController.restorePersistedSession();
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await initial).toBe(false);
    if (settled) {
      exchange.resolve({ status: 'restored', session: narrowGrant });
      await vi.advanceTimersByTimeAsync(1);
    }
    const retry = AuthController.restorePersistedSession();
    await vi.advanceTimersByTimeAsync(1);
    expect(restore).toHaveBeenCalledOnce();
    exchange.resolve({ status: 'restored', session: narrowGrant });
    expect(await retry).toBe(true);
    expect(useAuthStore.getState().session).toBe(narrowGrant);
  });
  it('rejects a recovery key for another account before issuing a root grant', async () => {
    useAuthStore.setState({ restoreStatus: 'reauth-required' });
    const signin = vi.spyOn(AuthApplication, 'signIn');
    vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(
      asOpaque<Keypair>({ publicKey: { z32: () => OTHER_PUBKY } }),
    );
    await expect(AuthController.loginWithMnemonic({ mnemonic: 'other account phrase' })).rejects.toMatchObject({
      name: 'AuthApprovalMismatch',
    });
    expect(signin).not.toHaveBeenCalled();
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
  });
  it('does not write metadata or notify subscribers for an empty retirement queue', async () => {
    const onChange = vi.fn();
    const unsubscribe = useAuthStore.subscribe(onChange);
    try {
      await AuthController.retrySessionRetirement();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });
  it('reports an unexpected database clear error without undoing local logout', async () => {
    vi.mocked(clearDatabase).mockRejectedValueOnce(new Error('Dexie cleanup failed'));
    const report = vi.spyOn(Err, 'server');
    await AuthController.logout();
    expect(report).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toBeNull();
  });
});
