import type { MigrationReport } from 'pubky-social-migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { SettingsApplication } from '@/application/settings/settings';
import { UserApplication } from '@/application/user/user';
import { APP_CAPABILITIES, SOCIAL_V1_APP_CAPABILITIES } from '@/config/auth';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';
import * as databaseHelpers from '@/database/franky/franky.helpers';
import { isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { Identity } from '@/libs/identity/identity';
import { readSocialMigrationRecord, writeSocialMigrationRecord } from '@/libs/social-migration/record';
import { resetSocialMigrationReports } from '@/libs/social-migration/report-telemetry';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { notificationInitialState } from '@/stores/notification/notification.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { useSocialMigrationStore } from '@/stores/socialMigration/socialMigration.store';
import { mockGrantReference, mockPubky, mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { AuthController } from './auth';

// A later build's transform revision, read through a getter so a test can bump it after the gate passed once
const transform = vi.hoisted(() => ({ bump: 0 }));
vi.mock('@/config/social-migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/social-migration')>();
  return {
    ...actual,
    get SOCIAL_MIGRATION_TRANSFORM_REV() {
      return actual.SOCIAL_MIGRATION_TRANSFORM_REV + transform.bump;
    },
  };
});

const pubky = mockPubky('5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y');
const session = mockSession({
  info: asOpaque({ publicKey: { z32: () => pubky }, capabilities: ['/:rw'] }),
  grant: asOpaque({ sessionInfo: async () => mockGrantReference('saved-grant') }),
});
const done = (): MigrationReport =>
  asOpaque<MigrationReport>({
    status: 'done',
    done: 0,
    total: 0,
    counts: {},
    dropped: 0,
    droppedValues: {},
    skipped: {},
  });
const flagBytes = (rev = SOCIAL_MIGRATION_TRANSFORM_REV) => ({
  bytes: new TextEncoder().encode(JSON.stringify({ transform_rev: rev })),
  modifiedAt: null,
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

/** Statuses the store went through, with whether a session was in it at the time. */
function trackStore() {
  const seen: string[] = [];
  const unsubscribe = useAuthStore.subscribe((state) => {
    const entry = `${state.restoreStatus}${state.session ? '+session' : ''}`;
    if (seen.at(-1) !== entry) seen.push(entry);
  });
  return { seen, unsubscribe };
}

/**
 * A reload on the next build, whose transform revision is one higher than the one this browser saw the flag at:
 * `grant` is the saved grant, and the homeserver still holds the flag of the earlier revision.
 */
function reloadOnNextTransformRevision(grant: string) {
  const seenRev = SOCIAL_MIGRATION_TRANSFORM_REV;
  transform.bump = 1;
  useAuthStore.setState({
    ...authInitialState,
    hasHydrated: true,
    isLoggingOut: false,
    sessionReference: mockGrantReference(grant),
    currentUserPubky: pubky,
    hasProfile: true,
    generation: `reload-${grant}`,
  });
  persistState();
  vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session });
  vi.spyOn(HomeserverService, 'getBytesIfExists').mockResolvedValue(flagBytes(seenRev));
  return vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(done());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('AuthController and the social v1 migration gate (ADR-0026)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetSocialMigrationReports();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
    useAuthStore.setState({ ...authInitialState, hasHydrated: true, isLoggingOut: false });
    useOnboardingStore.getState().reset();
    useSocialMigrationStore.getState().reset();
    vi.spyOn(AuthApplication, 'assertUserHomeserverAllowed').mockResolvedValue(undefined);
    vi.spyOn(AuthApplication, 'resolveUserIsSignedUp').mockResolvedValue(true);
    vi.spyOn(AuthApplication, 'userIsSignedUp').mockResolvedValue(true);
    vi.spyOn(SettingsApplication, 'initializeSettings').mockResolvedValue(null);
    vi.spyOn(BootstrapApplication, 'initialize').mockResolvedValue(notificationInitialState);
    vi.spyOn(UserApplication, 'ensureModerationFollow').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'logout').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'logoutLegacyCookie').mockResolvedValue(undefined);
    vi.spyOn(databaseHelpers, 'clearDatabase').mockResolvedValue(undefined);
  });

  afterEach(() => {
    transform.bump = 0;
    AuthController.cancelActiveAuthFlow();
    AuthController.cancelModerationFollow();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  describe('restore', () => {
    beforeEach(() => {
      useAuthStore.setState({
        sessionReference: mockGrantReference('saved-grant'),
        currentUserPubky: pubky,
        hasProfile: null,
        generation: 'restore-generation',
      });
      persistState();
      vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({ status: 'restored', session });
    });

    it('signs out a saved grant from before the gate without bootstrapping or placing the session', async () => {
      vi.spyOn(HomeserverService, 'getBytesIfExists').mockResolvedValue(null);
      const { seen, unsubscribe } = trackStore();

      expect(await AuthController.restorePersistedSession()).toBe(false);
      unsubscribe();

      expect(useAuthStore.getState()).toMatchObject({
        session: null,
        restoreStatus: 'social-migration',
        currentUserPubky: pubky,
        sessionReference: mockGrantReference('saved-grant'),
      });
      expect(useSocialMigrationStore.getState()).toMatchObject({
        stage: 'reauth-required',
        reason: 'pre-migration-grant',
      });
      expect(seen).toEqual(['restoring', 'social-migration']);
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
    });

    it('bootstraps a migrated account after the flag read, with the session placed only then', async () => {
      let sessionDuringFlagRead: unknown = 'unread';
      vi.spyOn(HomeserverService, 'getBytesIfExists').mockImplementation(async () => {
        sessionDuringFlagRead = useAuthStore.getState().session;
        return flagBytes();
      });
      const { seen, unsubscribe } = trackStore();

      expect(await AuthController.restorePersistedSession()).toBe(true);
      unsubscribe();

      expect(sessionDuringFlagRead).toBeNull();
      expect(seen).toEqual(['restoring', 'restoring+session', 'ready+session']);
      expect(BootstrapApplication.initialize).toHaveBeenCalledOnce();
      expect(readSocialMigrationRecord(pubky)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
    });

    it('restores with no request at all once the record is trusted', async () => {
      writeSocialMigrationRecord(pubky, { v: 1, migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV, admittedGrantIds: [] });
      const read = vi.spyOn(HomeserverService, 'getBytesIfExists');

      expect(await AuthController.restorePersistedSession()).toBe(true);

      expect(read).not.toHaveBeenCalled();
      expect(useAuthStore.getState().restoreStatus).toBe('ready');
    });

    it.each([
      ['blocked', { status: 'aborted', error: { code: 'UNSUPPORTED_EPOCH', message: '' } }],
      ['summary', { counts: { invalid: 1 } }],
    ] as const)(
      'cancels a gate paused on the %s screen when the SDK removes the grant, instead of hiding it behind a restore',
      async (stage, report) => {
        vi.spyOn(HomeserverService, 'getBytesIfExists').mockResolvedValue(null);
        writeSocialMigrationRecord(pubky, { v: 1, admittedGrantIds: ['saved-grant'] });
        vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(
          asOpaque<MigrationReport>({ ...done(), ...report }),
        );
        vi.mocked(AuthApplication.restorePersistedSession)
          .mockResolvedValueOnce({ status: 'restored', session })
          .mockResolvedValueOnce({ status: 'reauth-required' });
        const restore = AuthController.restorePersistedSession();
        await vi.waitFor(() => expect(useSocialMigrationStore.getState().stage).toBe(stage));

        await AuthController.syncRemovedSession('saved-grant');

        expect(await restore).toBe(false);
        expect(useSocialMigrationStore.getState().stage).toBe('idle');
        expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'reauth-required' });
        expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
      },
    );

    it('re-walks a grant whose first restore passed on the flag after a transform revision bump, instead of signing it out', async () => {
      vi.spyOn(HomeserverService, 'getBytesIfExists').mockResolvedValue(flagBytes());
      expect(await AuthController.restorePersistedSession()).toBe(true);
      // Passed on the flag: the record saw it, the grant was never admitted
      expect(readSocialMigrationRecord(pubky)).toMatchObject({
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
        admittedGrantIds: [],
      });

      const run = reloadOnNextTransformRevision('saved-grant');

      expect(await AuthController.restorePersistedSession()).toBe(true);
      expect(run).toHaveBeenCalledOnce();
      expect(useSocialMigrationStore.getState().stage).toBe('idle');
      expect(useAuthStore.getState()).toMatchObject({ session, restoreStatus: 'ready' });
      expect(readSocialMigrationRecord(pubky)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
    });

    it('offers recovery when the flag cannot be read', async () => {
      vi.spyOn(HomeserverService, 'getBytesIfExists').mockRejectedValue(new Error('offline'));

      expect(await AuthController.restorePersistedSession()).toBe(false);

      expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'temporary-error' });
    });

    it('offers recovery when the flag read never answers, and a retry that gets an answer passes the gate', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const hung = deferred<ReturnType<typeof flagBytes>>();
      const read = vi.spyOn(HomeserverService, 'getBytesIfExists').mockReturnValueOnce(hung.promise);
      const { seen, unsubscribe } = trackStore();

      const restore = AuthController.restorePersistedSession();
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

      expect(await restore).toBe(false);
      expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'temporary-error' });
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();

      // The abandoned GET answering late places nothing; the retry (focus, network, or the screen's Retry) does.
      hung.resolve(flagBytes());
      await vi.advanceTimersByTimeAsync(0);
      read.mockResolvedValueOnce(flagBytes());

      expect(await AuthController.restorePersistedSession()).toBe(true);
      unsubscribe();

      expect(seen).toEqual(['restoring', 'temporary-error', 'restoring', 'restoring+session', 'ready+session']);
      expect(read).toHaveBeenCalledTimes(2);
      expect(BootstrapApplication.initialize).toHaveBeenCalledOnce();
      expect(readSocialMigrationRecord(pubky)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
    });

    // A late exchange result re-enters `restorePersistedSession` on its own (pubky/pubky-app#3126, dev-sync 7); the
    // gate still decides before the session is placed.
    describe('an exchange that settles after the UI deadline', () => {
      type Exchange = Awaited<ReturnType<typeof AuthApplication.restorePersistedSession>>;

      beforeEach(() => {
        vi.useFakeTimers();
      });

      // Each test saves its own grant: the controller keys the shared exchange on the reference.
      it('reads the flag before placing the late session, without another lifecycle event', async () => {
        useAuthStore.setState({ sessionReference: mockGrantReference('late-passed') });
        persistState();
        const exchange = deferred<Exchange>();
        vi.mocked(AuthApplication.restorePersistedSession).mockReturnValue(exchange.promise);
        let sessionDuringFlagRead: unknown = 'unread';
        const read = vi.spyOn(HomeserverService, 'getBytesIfExists').mockImplementation(async () => {
          sessionDuringFlagRead = useAuthStore.getState().session;
          return flagBytes();
        });
        const { seen, unsubscribe } = trackStore();
        const initial = AuthController.restorePersistedSession();
        await vi.advanceTimersByTimeAsync(12_001);
        expect(await initial).toBe(false);
        expect(read).not.toHaveBeenCalled();

        exchange.resolve({ status: 'restored', session });
        await vi.advanceTimersByTimeAsync(1);
        unsubscribe();

        expect(read).toHaveBeenCalledOnce();
        expect(sessionDuringFlagRead).toBeNull();
        expect(seen).toEqual(['restoring', 'temporary-error', 'restoring', 'restoring+session', 'ready+session']);
        expect(AuthApplication.restorePersistedSession).toHaveBeenCalledOnce();
        expect(BootstrapApplication.initialize).toHaveBeenCalledOnce();
        expect(readSocialMigrationRecord(pubky)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
      });

      it('signs out a late session from before the gate instead of placing it', async () => {
        useAuthStore.setState({ sessionReference: mockGrantReference('late-pre-gate') });
        persistState();
        const exchange = deferred<Exchange>();
        vi.mocked(AuthApplication.restorePersistedSession).mockReturnValue(exchange.promise);
        vi.spyOn(HomeserverService, 'getBytesIfExists').mockResolvedValue(null);
        const { seen, unsubscribe } = trackStore();
        const initial = AuthController.restorePersistedSession();
        await vi.advanceTimersByTimeAsync(12_001);
        expect(await initial).toBe(false);

        exchange.resolve({ status: 'restored', session });
        await vi.advanceTimersByTimeAsync(60_000);
        unsubscribe();

        expect(useAuthStore.getState()).toMatchObject({
          session: null,
          restoreStatus: 'social-migration',
          currentUserPubky: pubky,
          sessionReference: mockGrantReference('late-pre-gate'),
        });
        expect(useSocialMigrationStore.getState()).toMatchObject({
          stage: 'reauth-required',
          reason: 'pre-migration-grant',
        });
        expect(seen).toEqual(['restoring', 'temporary-error', 'restoring', 'social-migration']);
        expect(AuthApplication.restorePersistedSession).toHaveBeenCalledOnce();
        expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
      });
    });
  });

  describe('sign-in', () => {
    beforeEach(() => {
      vi.spyOn(Identity, 'keypairFromMnemonic').mockReturnValue(asOpaque({}));
      vi.spyOn(AuthApplication, 'signIn').mockResolvedValue({ session });
      vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(mockGrantReference('new-grant'));
    });

    it('runs the engine before the session enters the store and bootstraps after it passed', async () => {
      let sessionDuringRun: unknown = 'unread';
      let statusDuringRun: string | undefined;
      vi.spyOn(HomeserverService, 'migrateToSocialV1').mockImplementation(async () => {
        sessionDuringRun = useAuthStore.getState().session;
        statusDuringRun = useAuthStore.getState().restoreStatus;
        return done();
      });
      const { seen, unsubscribe } = trackStore();

      expect(await AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' })).toBe(true);
      unsubscribe();

      expect(sessionDuringRun).toBeNull();
      expect(statusDuringRun).toBe('social-migration');
      expect(seen).toEqual(['restoring', 'social-migration', 'restoring+session', 'ready+session']);
      expect(BootstrapApplication.initialize).toHaveBeenCalledOnce();
      expect(readSocialMigrationRecord(pubky)).toMatchObject({
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
        admittedGrantIds: ['new-grant'],
      });
    });

    it('leaves the account on the gate when the session expired mid-run, reporting the sign-in as not completed', async () => {
      vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(
        asOpaque<MigrationReport>({ ...done(), status: 'aborted', error: { code: 'SESSION_EXPIRED', message: '' } }),
      );

      // F-QA6-1: a `true` here made the sign-in dialog navigate home over the signed-out explanation
      expect(await AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' })).toBe(false);

      expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'social-migration' });
      expect(useSocialMigrationStore.getState()).toMatchObject({ stage: 'reauth-required', reason: 'session-expired' });
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
    });

    it('cancels the run and the sign-in when logout begins during the migration', async () => {
      vi.spyOn(HomeserverService, 'migrateToSocialV1').mockImplementation(
        ({ signal }) =>
          new Promise((resolve) =>
            signal?.addEventListener('abort', () =>
              resolve(
                asOpaque<MigrationReport>({ ...done(), status: 'aborted', error: { code: 'ABORTED', message: '' } }),
              ),
            ),
          ),
      );
      const signIn = AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' }).catch((error: unknown) => error);
      await vi.waitFor(() => expect(useSocialMigrationStore.getState().stage).toBe('running'));

      await AuthController.logout();

      expect(isAuthFlowCanceledError(await signIn)).toBe(true);
      expect(useAuthStore.getState()).toMatchObject({ session: null, currentUserPubky: null });
      expect(useSocialMigrationStore.getState().stage).toBe('idle');
      expect(readSocialMigrationRecord(pubky)?.migratedRev).toBeUndefined();
    });

    it('retains the admitted session for a retry when account preparation fails after the gate', async () => {
      vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(done());
      vi.spyOn(AuthApplication, 'prepareAccount').mockRejectedValueOnce(new Error('cleanup failed'));
      useAuthStore.setState({ currentUserPubky: mockPubky('o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo') });
      persistState();

      await expect(AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' })).rejects.toThrow('cleanup failed');

      expect(useAuthStore.getState()).toMatchObject({ session, restoreStatus: 'temporary-error' });
    });
  });

  describe('upgrade', () => {
    // A signed-in grant without the Locks scopes; the approved replacement is root, like `session`.
    const narrowSession = mockSession({
      info: asOpaque({
        publicKey: { z32: () => pubky },
        capabilities: [APP_CAPABILITIES, ...SOCIAL_V1_APP_CAPABILITIES],
      }),
      grant: asOpaque({ sessionInfo: async () => mockGrantReference('narrow-grant') }),
    });

    beforeEach(() => {
      useAuthStore.setState({
        session: narrowSession,
        sessionReference: mockGrantReference('narrow-grant'),
        currentUserPubky: pubky,
        hasProfile: true,
        generation: 'upgrade-generation',
        restoreStatus: 'ready',
      });
      persistState();
      vi.spyOn(AuthApplication, 'startGrantFlow').mockResolvedValue(
        asOpaque({
          url: 'pubkyauth://flow',
          awaitApproval: Promise.resolve(session),
          cancelAuthFlow: vi.fn(),
          completeAuthFlow: vi.fn(),
        }),
      );
      vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(mockGrantReference('upgraded-grant'));
      // The replaced grant's retirement runs detached once the upgrade is adopted (asserted by each case)
      vi.spyOn(AuthApplication, 'logout').mockResolvedValue(undefined);
      vi.spyOn(AuthApplication, 'removeSessionRecord').mockResolvedValue(undefined);
    });

    it('gates an upgrade of an account this browser never saw pass: the engine runs before the session is placed (D11)', async () => {
      let sessionDuringRun: unknown = 'unread';
      let statusDuringRun: string | undefined;
      const run = vi.spyOn(HomeserverService, 'migrateToSocialV1').mockImplementation(async () => {
        sessionDuringRun = useAuthStore.getState().session;
        statusDuringRun = useAuthStore.getState().restoreStatus;
        return done();
      });
      const { seen, unsubscribe } = trackStore();

      const flow = await AuthController.getUpgradeAuthUrl(true);
      await flow?.awaitApproval;
      unsubscribe();

      expect(flow).not.toBeNull();
      expect(run).toHaveBeenCalledOnce();
      expect(sessionDuringRun).toBeNull();
      expect(statusDuringRun).toBe('social-migration');
      expect(seen).toEqual(['restoring', 'social-migration', 'restoring+session', 'ready+session']);
      expect(useAuthStore.getState()).toMatchObject({
        session,
        sessionReference: mockGrantReference('upgraded-grant'),
        restoreStatus: 'ready',
      });
      expect(readSocialMigrationRecord(pubky)).toMatchObject({
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
        admittedGrantIds: ['upgraded-grant'],
      });
      // Still an upgrade: no profile bootstrap, and the replaced grant is retired
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowSession }));
    });

    it('keeps the context of an upgrade once this browser saw the account pass: no gate, no request', async () => {
      writeSocialMigrationRecord(pubky, { v: 1, migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV, admittedGrantIds: [] });
      const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');
      const read = vi.spyOn(HomeserverService, 'getBytesIfExists');
      const { seen, unsubscribe } = trackStore();

      const flow = await AuthController.getUpgradeAuthUrl(true);
      await flow?.awaitApproval;
      unsubscribe();

      expect(flow).not.toBeNull();
      expect(run).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      // The replacement is written in place: the status never leaves ready and the store never lacks a session
      expect(seen).toEqual(['ready+session']);
      expect(useAuthStore.getState()).toMatchObject({
        session,
        sessionReference: mockGrantReference('upgraded-grant'),
        restoreStatus: 'ready',
      });
      expect(BootstrapApplication.initialize).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowSession }));
    });
    it('admits the grant of an upgrade adopted on a trusted record, which re-walks after a transform revision bump instead of signing out', async () => {
      writeSocialMigrationRecord(pubky, {
        v: 1,
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
        admittedGrantIds: ['narrow-grant'],
      });

      const flow = await AuthController.getUpgradeAuthUrl(true);
      await flow?.awaitApproval;
      await vi.waitFor(() => expect(AuthApplication.logout).toHaveBeenCalledWith({ session: narrowSession }));

      expect(useAuthStore.getState().sessionReference).toEqual(mockGrantReference('upgraded-grant'));
      expect(readSocialMigrationRecord(pubky)?.admittedGrantIds).toEqual(['narrow-grant', 'upgraded-grant']);

      const run = reloadOnNextTransformRevision('upgraded-grant');

      expect(await AuthController.restorePersistedSession()).toBe(true);
      expect(run).toHaveBeenCalledOnce();
      expect(useSocialMigrationStore.getState()).toMatchObject({ stage: 'idle', reason: undefined });
      expect(useAuthStore.getState()).toMatchObject({ session, restoreStatus: 'ready' });
      expect(readSocialMigrationRecord(pubky)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
    });
  });

  it('ends a Ring attempt whose session the gate signed out, so its pending record is discarded', async () => {
    const complete = vi.fn();
    vi.spyOn(AuthApplication, 'startGrantFlow').mockResolvedValue(
      asOpaque({
        url: 'pubkyauth://flow',
        awaitApproval: Promise.resolve(session),
        cancelAuthFlow: vi.fn(),
        completeAuthFlow: complete,
      }),
    );
    vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(mockGrantReference('ring-grant'));
    vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(
      asOpaque<MigrationReport>({ ...done(), status: 'aborted', error: { code: 'SESSION_EXPIRED', message: '' } }),
    );

    const flow = await AuthController.getAuthUrl();
    await flow.awaitApproval;

    expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'social-migration' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('runs a Ring signup inline: the status never leaves restoring for the gate', async () => {
    const complete = vi.fn();
    vi.spyOn(AuthApplication, 'startGrantFlow').mockResolvedValue(
      asOpaque({
        url: 'pubkyauth://flow',
        awaitApproval: Promise.resolve(session),
        cancelAuthFlow: vi.fn(),
        completeAuthFlow: complete,
      }),
    );
    vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(mockGrantReference('signup-grant'));
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(done());
    const { seen, unsubscribe } = trackStore();

    const flow = await AuthController.getSignupAuthUrl('invite');
    await flow.awaitApproval;
    unsubscribe();

    expect(AuthApplication.startGrantFlow).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'signup', inviteCode: 'invite' }),
    );
    expect(run).toHaveBeenCalledOnce();
    expect(seen).not.toContain('social-migration');
    expect(useAuthStore.getState()).toMatchObject({ session, restoreStatus: 'ready' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('keeps waiting for a session held behind the gate', async () => {
    useAuthStore.setState({ currentUserPubky: pubky, generation: 'g', restoreStatus: 'social-migration' });
    const controller = new AbortController();
    const wait = AuthController.waitForSession(controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(await wait).toBe('canceled');
  });
});
