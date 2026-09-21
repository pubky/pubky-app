import type { Keypair, Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { SettingsApplication } from '@/application/settings/settings';
import { UserApplication } from '@/application/user/user';
import { APP_CAPABILITIES, getAuthClientId, LOCKS_CAPABILITIES } from '@/config/auth';
import { clearDatabase } from '@/database/franky/franky.helpers';
import type { SessionReference } from '@/libs/auth/session.types';
import { AuthErrorCode, ClientErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { AUTH_PERSIST_KEY, ONBOARDING_PERSIST_KEY, SETTINGS_PERSIST_KEY } from '@/stores/persistedKeys';
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
const grantSession = (capabilities: string[] = [APP_CAPABILITIES], pubky = PUBKY): Session =>
  asOpaque({
    info: { publicKey: { z32: () => pubky }, capabilities },
    grant: { sessionInfo: vi.fn().mockResolvedValue({ ...grantReference(), publicKey: { z32: () => pubky } }) },
    export: vi.fn(() => {
      throw new Error('Grant secrets must never be exported');
    }),
  });
const cookie = asOpaque<Session>({
  info: { publicKey: { z32: () => PUBKY }, capabilities: [APP_CAPABILITIES] },
  export: () => 'legacy',
});
const cookieReference: SessionReference = { kind: 'cookie', sessionExport: 'legacy' };
function seed(session: Session | null = cookie, reference: SessionReference | null = cookieReference) {
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
      version: 2,
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
  vi.spyOn(AuthApplication, 'removeSessionRecord').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'removeUnusedSessionRecord').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
  vi.spyOn(AuthApplication, 'restoreReference').mockResolvedValue(cookie);
  vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(false);
  vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);
  vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue({
    unread: 0,
    lastRead: 0,
    lastPolledTimestamp: undefined,
  });
  vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(undefined);
  vi.mocked(clearDatabase).mockClear();
});
afterEach(() => {
  AuthController.cancelActiveAuthFlow();
  AuthController.cancelModerationFollow();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('gradual grant migration', () => {
  it('restores a cookie without forcing conversion or clearing account data', async () => {
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session: cookie });
    expect(await AuthController.restorePersistedSession()).toBe(true);
    expect(useAuthStore.getState().sessionReference).toEqual(cookieReference);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it.each(['temporary-error', 'reauth-required'] as const)('preserves credentials and cache on %s', async (status) => {
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status });
    expect(await AuthController.restorePersistedSession()).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      sessionReference: cookieReference,
      hasProfile: true,
      restoreStatus: status,
      isRestoringSession: false,
    });
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('bounds a hanging restore and permits retry', async () => {
    vi.useFakeTimers();
    seed(null);
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(new Promise(() => {}));
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
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session: cookie });
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
      JSON.stringify({ version: 2, state: { ...AuthApplication.readPersistedAuth(), hasProfile: false } }),
    );
    const pending = deferred<Awaited<ReturnType<typeof AuthApplication.restorePersistedSession>>>();
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockReturnValue(pending.promise);
    const restore = AuthController.restorePersistedSession();
    // Another tab creates the profile and completes retirement without replacing this grant.
    localStorage.setItem(
      AUTH_PERSIST_KEY,
      JSON.stringify({ version: 2, state: { ...AuthApplication.readPersistedAuth(), hasProfile: true } }),
    );
    await AuthController.syncSessionFromStorage();
    pending.resolve({ status: 'restored', session: cookie });
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
    pending.resolve({ status: 'restored', session: cookie });
    expect(await restore).toBe(false);
    expect(useAuthStore.getState().sessionReference).toBeNull();
  });
  it('requests only app public permissions for ordinary Ring sign-in', async () => {
    startFlow();
    await AuthController.getAuthUrl();
    expect(AuthApplication.startGrantFlow).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'signin', capabilities: APP_CAPABILITIES }),
    );
  });
  it('shares one active approval when Strict Mode requests the same flow twice', async () => {
    const flow = startFlow();
    const [first, second] = await Promise.all([AuthController.getAuthUrl(), AuthController.getAuthUrl()]);
    expect(AuthApplication.startGrantFlow).toHaveBeenCalledOnce();
    expect(first.awaitApproval).toBe(second.awaitApproval);
    expect(flow.cancel).not.toHaveBeenCalled();
  });
  it('does not request extra approval when root cookie permissions already cover Locks', async () => {
    seed(asOpaque({ ...cookie, info: { ...cookie.info, capabilities: ['/:rw'] } }));
    startFlow();
    expect(await AuthController.requestCapabilities()).toBeNull();
    expect(AuthApplication.startGrantFlow).not.toHaveBeenCalled();
  });
  it('saves a same-account grant before retiring the cookie, preserving profile and cache', async () => {
    const flow = startFlow();
    const next = grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]);
    const result = await AuthController.requestCapabilities();
    vi.mocked(AuthApplication.logout).mockImplementation(async ({ session }) => {
      expect(session).toBe(cookie);
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
    await expect(result!.awaitApproval).rejects.toMatchObject({ code: AuthErrorCode.FORBIDDEN });
    expect(useAuthStore.getState().session).toBe(cookie);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
    expect(AuthApplication.logout).not.toHaveBeenCalled();
  });
  it('rejects insufficient approved scopes', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    flow.approval.resolve(grantSession());
    await expect(result!.awaitApproval).rejects.toMatchObject({ code: AuthErrorCode.FORBIDDEN });
    expect(useAuthStore.getState().session).toBe(cookie);
  });
  it('keeps the old session on cancel even if its approval arrives later', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    result!.cancelAuthFlow();
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await expect(result!.awaitApproval).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    expect(useAuthStore.getState().session).toBe(cookie);
    expect(AuthApplication.saveSession).not.toHaveBeenCalled();
  });
  it.each(['sdk', 'reference'])('keeps the old session if %s persistence fails', async (stage) => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    if (stage === 'sdk') vi.mocked(AuthApplication.saveSession).mockRejectedValue(offline());
    else vi.spyOn(AuthApplication, 'commitPersistedAuth').mockRejectedValue(offline());
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await expect(result!.awaitApproval).rejects.toThrow();
    expect(useAuthStore.getState().session).toBe(cookie);
    expect(AuthApplication.logout).not.toHaveBeenCalled();
    expect(clearDatabase).not.toHaveBeenCalled();
  });
  it('keeps the new grant and pending retirement when cookie signout cannot be confirmed', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    vi.mocked(AuthApplication.logout).mockRejectedValueOnce(offline());
    const next = grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]);
    flow.approval.resolve(next);
    await expect(result!.awaitApproval).rejects.toThrow();
    expect(useAuthStore.getState()).toMatchObject({
      session: next,
      sessionReference: { kind: 'grant' },
      retiringSession: cookieReference,
      restoreStatus: 'temporary-error',
    });
    await AuthController.restorePersistedSession();
    expect(useAuthStore.getState().retiringSession).toBeNull();
    expect(useAuthStore.getState().restoreStatus).toBe('ready');
  });
  it('does not treat an auth error during signout as successful retirement', async () => {
    const flow = startFlow();
    const result = await AuthController.requestCapabilities();
    vi.mocked(AuthApplication.logout).mockRejectedValue(expired());
    flow.approval.resolve(grantSession([APP_CAPABILITIES, ...LOCKS_CAPABILITIES]));
    await expect(result!.awaitApproval).rejects.toThrow();
    expect(useAuthStore.getState().retiringSession).toEqual(cookieReference);
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
      expect(AuthApplication.removeSessionRecord).toHaveBeenCalledWith(old);
      expect(clearDatabase).not.toHaveBeenCalled();
    },
  );
  it('keeps grant retirement retryable when IndexedDB is temporarily unavailable', async () => {
    seed(null, grantReference('old'));
    const flow = startFlow();
    const result = await AuthController.getAuthUrl();
    vi.mocked(AuthApplication.restoreReference).mockRejectedValue(offline());
    flow.approval.resolve(grantSession());
    await expect(result.awaitApproval).rejects.toThrow();
    expect(useAuthStore.getState()).toMatchObject({
      restoreStatus: 'temporary-error',
      retiringSession: { grantId: 'old' },
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
    vi.mocked(AuthApplication.userIsSignedUp).mockRejectedValueOnce(offline()).mockResolvedValue(true);
    await AuthController.syncSessionFromStorage();
    expect(useAuthStore.getState()).toMatchObject({ needsAccountSync: true, restoreStatus: 'temporary-error' });
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
    vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(asOpaque({ publicKey: { z32: () => OTHER_PUBKY } }));
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
    expect(AuthApplication.removeUnusedSessionRecord).toHaveBeenCalled();
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
    expect(useAuthStore.getState()).toMatchObject({ session: next, hasProfile: false, sessionExport: null });
    expect(AuthApplication.readPersistedAuth()?.sessionReference?.kind).toBe('grant');
    expect(clearDatabase).toHaveBeenCalledOnce();
  });
  it('cleans up locally after a bounded offline logout', async () => {
    vi.useFakeTimers();
    vi.mocked(AuthApplication.logout).mockReturnValue(new Promise(() => {}));
    const logout = AuthController.logout();
    await vi.advanceTimersByTimeAsync(5001);
    await logout;
    expect(useAuthStore.getState().sessionReference).toBeNull();
    expect(AuthApplication.readPersistedAuth()?.sessionReference).toBeNull();
    expect(clearDatabase).toHaveBeenCalledOnce();
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
    await logout;
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
});
