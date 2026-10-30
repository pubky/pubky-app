import type { MigrationReport } from 'pubky-social-migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { SettingsApplication } from '@/application/settings/settings';
import { UserApplication } from '@/application/user/user';
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
const flagBytes = () => ({
  bytes: new TextEncoder().encode(JSON.stringify({ transform_rev: SOCIAL_MIGRATION_TRANSFORM_REV })),
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
    AuthController.cancelActiveAuthFlow();
    AuthController.cancelModerationFollow();
    vi.restoreAllMocks();
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

    it('offers recovery when the flag cannot be read', async () => {
      vi.spyOn(HomeserverService, 'getBytesIfExists').mockRejectedValue(new Error('offline'));

      expect(await AuthController.restorePersistedSession()).toBe(false);

      expect(useAuthStore.getState()).toMatchObject({ session: null, restoreStatus: 'temporary-error' });
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

    it('leaves the account on the gate when the session expired mid-run, without an error', async () => {
      vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(
        asOpaque<MigrationReport>({ ...done(), status: 'aborted', error: { code: 'SESSION_EXPIRED', message: '' } }),
      );

      expect(await AuthController.loginWithMnemonic({ mnemonic: 'recovery phrase' })).toBe(true);

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

  it('runs a signup inline: the status never leaves restoring for the gate', async () => {
    vi.spyOn(Identity, 'keypairFromSecretKey').mockReturnValue(asOpaque({ publicKey: { z32: () => pubky } }));
    vi.spyOn(AuthApplication, 'createAccount').mockResolvedValue(undefined);
    vi.spyOn(AuthApplication, 'signInCreatedAccount').mockResolvedValue({ session });
    vi.spyOn(AuthApplication, 'saveSession').mockResolvedValue(mockGrantReference('signup-grant'));
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(done());
    const { seen, unsubscribe } = trackStore();

    await AuthController.signUp({ secretKey: 'secret', signupToken: 'invite' });
    unsubscribe();

    expect(run).toHaveBeenCalledOnce();
    expect(seen).not.toContain('social-migration');
    expect(useAuthStore.getState().restoreStatus).toBe('ready');
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
