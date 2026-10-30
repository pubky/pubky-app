import type { Session } from '@synonymdev/pubky';
import type { MigrationReport, Outcome } from 'pubky-social-migrator';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_MIGRATION_FLAG_PATH, SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';
import { AuthErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { readSocialMigrationRecord, writeSocialMigrationRecord } from '@/libs/social-migration/record';
import { resetSocialMigrationReports } from '@/libs/social-migration/report-telemetry';
import { readSocialMigrationSignedOutNotice } from '@/libs/social-migration/signed-out-notice';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useSocialMigrationStore } from '@/stores/socialMigration/socialMigration.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { mockGrantReference } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { SocialMigrationController } from './social-migration';

const GENERATION = 'gate-generation';
const GRANT = 'grant-1';

const emptyCounts = (): Record<Outcome, number> => ({
  malformed: 0,
  shape: 0,
  unsafe_integer: 0,
  empty_title: 0,
  unknown_feed_content: 0,
  oversize: 0,
  invalid: 0,
  not_migrated: 0,
  written: 0,
  already_present: 0,
  deleted_mid_run: 0,
  io_error: 0,
  put_rejected: 0,
});

const report = (partial: Partial<MigrationReport> = {}): MigrationReport => ({
  status: 'done',
  mode: 'run',
  done: 0,
  total: 0,
  counts: emptyCounts(),
  dropped: 0,
  droppedValues: {},
  skipped: {},
  notes: [],
  ...partial,
});

describe('SocialMigrationController', () => {
  // The real migrator over the in-memory homeserver; `stubMemoryHomeserver` answers the flag read from the same store.
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let owner: string;
  const session = (capabilities: string[] = ['/:rw']): Session =>
    asOpaque<Session>({ ...homeserver.session, info: { ...homeserver.session.info, capabilities } });
  /** The session with every object read held until `release`, so a run can be observed mid-walk. */
  const slowSession = () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { storage } = homeserver.session;
    const slow = asOpaque<Session>({
      ...homeserver.session,
      info: { ...homeserver.session.info, capabilities: ['/:rw'] },
      storage: {
        ...storage,
        // The port streams objects through `get`
        get: async (path: string) => {
          await held;
          return storage.get(path);
        },
      },
    });
    return { session: slow, release };
  };
  const seedLegacyTree = async () => {
    await homeserver.session.storage.putJson('/pub/pubky.app/profile.json', { name: 'Alice', bio: 'hi' });
    await homeserver.session.storage.putJson(`/pub/pubky.app/follows/${homeserver.friend}`, { created_at: 1 });
    await homeserver.session.storage.putJson(`/pub/pubky.app/follows/${fakeOwner(7)}`, { created_at: 2 });
    await homeserver.session.storage.putJson('/pub/pubky.app/last_read', { timestamp: 3 });
  };
  const ensure = (entry: 'restore' | 'signin' | 'signup' | 'upgrade', target = session()) =>
    SocialMigrationController.ensureMigrated({
      session: target,
      generation: GENERATION,
      entry,
      isCurrent: () => useAuthStore.getState().generation === GENERATION,
    });
  const status = () => useAuthStore.getState().restoreStatus;
  const stage = () => useSocialMigrationStore.getState();

  beforeEach(() => {
    homeserver = stubMemoryHomeserver(fakeOwner(1));
    owner = homeserver.owner;
    localStorage.clear();
    sessionStorage.clear();
    resetSocialMigrationReports();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
    useSocialMigrationStore.getState().reset();
    useAuthStore.setState({
      ...authInitialState,
      hasHydrated: true,
      generation: GENERATION,
      currentUserPubky: owner,
      sessionReference: mockGrantReference(GRANT),
      restoreStatus: 'restoring',
    });
  });

  afterEach(() => {
    SocialMigrationController.cancel();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  it('migrates a fresh sign-in through the screen, records the flag and admits the grant', async () => {
    await seedLegacyTree();
    const stages: string[] = [];
    const unsubscribe = useSocialMigrationStore.subscribe((state) => {
      if (stages.at(-1) !== `${state.stage}:${state.phase ?? ''}`) stages.push(`${state.stage}:${state.phase ?? ''}`);
    });

    const outcome = await ensure('signin');
    unsubscribe();

    expect(outcome).toBe('passed');
    expect(status()).toBe('social-migration');
    expect(stages).toEqual([
      'idle:',
      'running:',
      'running:probe',
      'running:listing',
      'running:migrating',
      'running:flag',
      'running:done',
      'idle:',
    ]);
    expect(await homeserver.session.storage.exists('/pub/social/v1/profile.json')).toBe(true);
    expect(await homeserver.session.storage.exists(SOCIAL_MIGRATION_FLAG_PATH)).toBe(true);
    expect(readSocialMigrationRecord(owner)).toMatchObject({
      migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
      admittedGrantIds: [GRANT],
    });
    expect(readSocialMigrationRecord(owner)?.notice).toBeUndefined();
    expect(stage().stage).toBe('idle');
  });

  it('passes a restore with a trusted record without any request or chunk', async () => {
    writeSocialMigrationRecord(owner, { v: 1, migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV, admittedGrantIds: [] });
    const read = vi.spyOn(HomeserverService, 'getBytesIfExists');
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');

    expect(await ensure('restore')).toBe('passed');

    expect(read).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(status()).toBe('restoring');
  });

  it('walks a record from an older transform revision again', async () => {
    writeSocialMigrationRecord(owner, { v: 1, migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV - 1, admittedGrantIds: [] });
    const read = vi.spyOn(HomeserverService, 'getBytesIfExists');

    expect(await ensure('restore')).toBe('reauth-required');

    expect(read).toHaveBeenCalledOnce();
  });

  it('passes a restore whose flag is on the homeserver and writes the record, without the engine', async () => {
    await homeserver.session.storage.putJson(SOCIAL_MIGRATION_FLAG_PATH, {
      migrated_at: 1,
      transform_rev: SOCIAL_MIGRATION_TRANSFORM_REV,
      skipped: {},
      migrated: [],
    });
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');

    expect(await ensure('restore')).toBe('passed');

    expect(run).not.toHaveBeenCalled();
    expect(readSocialMigrationRecord(owner)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
    expect(status()).toBe('restoring');
  });

  it('signs out a restored grant this build did not admit when the flag is absent (D2)', async () => {
    await seedLegacyTree();
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');

    expect(await ensure('restore')).toBe('reauth-required');

    expect(run).not.toHaveBeenCalled();
    expect(status()).toBe('social-migration');
    expect(stage()).toMatchObject({ stage: 'reauth-required', reason: 'pre-migration-grant' });
    expect(readSocialMigrationSignedOutNotice()).toEqual({ reason: 'pre-migration-grant' });
    expect(await homeserver.session.storage.exists('/pub/social/v1/profile.json')).toBe(false);
  });

  it('resumes a restored grant this build admitted instead of signing it out', async () => {
    await seedLegacyTree();
    writeSocialMigrationRecord(owner, { v: 1, admittedGrantIds: [GRANT], lastRun: undefined });

    expect(await ensure('restore')).toBe('passed');

    expect(await homeserver.session.storage.exists(SOCIAL_MIGRATION_FLAG_PATH)).toBe(true);
    expect(readSocialMigrationRecord(owner)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
  });

  it('shows where an earlier run stopped until the new listing is walked', async () => {
    await seedLegacyTree();
    writeSocialMigrationRecord(owner, {
      v: 1,
      admittedGrantIds: [GRANT],
      lastRun: { at: 1, status: 'running', done: 2, total: 9, counts: {}, dropped: 0 },
    });
    const seen: Array<{ phase?: string; resumedFrom?: { done: number } }> = [];
    const unsubscribe = useSocialMigrationStore.subscribe((state) =>
      seen.push({ phase: state.phase, resumedFrom: state.resumedFrom }),
    );

    await ensure('restore');
    unsubscribe();

    expect(seen.find((entry) => entry.phase === 'listing')?.resumedFrom).toEqual({ done: 2, total: 9 });
    expect(seen.filter((entry) => entry.phase === 'migrating').at(-1)?.resumedFrom).toBeUndefined();
  });

  it('signs out a session without the social v1 scopes before any request', async () => {
    const read = vi.spyOn(HomeserverService, 'getBytesIfExists');

    expect(await ensure('restore', session(['/pub/pubky.app/:rw']))).toBe('reauth-required');

    expect(read).not.toHaveBeenCalled();
    expect(stage()).toMatchObject({ stage: 'reauth-required', reason: 'missing-scopes' });
    expect(readSocialMigrationSignedOutNotice()).toEqual({ reason: 'missing-scopes' });
  });

  it('throws a flag read failure to the caller instead of treating it as absent', async () => {
    vi.spyOn(HomeserverService, 'getBytesIfExists').mockRejectedValue(new Error('offline'));

    await expect(ensure('restore')).rejects.toThrow('offline');
    expect(status()).toBe('restoring');
  });

  it('runs a signup inline on its empty tree without the screen, and the engine writes the flag', async () => {
    const outcome = await ensure('signup');

    expect(outcome).toBe('passed');
    expect(status()).toBe('restoring');
    expect(await homeserver.session.storage.exists(SOCIAL_MIGRATION_FLAG_PATH)).toBe(true);
    expect(readSocialMigrationRecord(owner)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
  });

  it('passes an upgrade from the local record only, and runs like a sign-in without one', async () => {
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(report());
    writeSocialMigrationRecord(owner, { v: 1, migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV, admittedGrantIds: [] });
    expect(await ensure('upgrade')).toBe('passed');
    expect(run).not.toHaveBeenCalled();
    expect(SocialMigrationController.hasPassedLocally(owner)).toBe(true);

    localStorage.clear();
    expect(SocialMigrationController.hasPassedLocally(owner)).toBe(false);
    expect(await ensure('upgrade')).toBe('passed');
    expect(run).toHaveBeenCalledOnce();
  });

  it('cancels a run when logout begins and leaves no record of a migration', async () => {
    await seedLegacyTree();
    const slow = slowSession();
    const migrating = ensure('signin', slow.session);
    await vi.waitFor(() => expect(['listing', 'migrating']).toContain(stage().phase));

    useAuthStore.getState().setIsLoggingOut(true);
    slow.release();

    expect(await migrating).toBe('canceled');
    expect(readSocialMigrationRecord(owner)?.migratedRev).toBeUndefined();
    expect(await homeserver.session.storage.exists(SOCIAL_MIGRATION_FLAG_PATH)).toBe(false);
  });

  it('cancels a run when another generation takes the store', async () => {
    await seedLegacyTree();
    const migrating = ensure('signin');
    await vi.waitFor(() => expect(stage().stage).toBe('running'));

    useAuthStore.setState({ generation: 'another-tab' });

    expect(await migrating).toBe('canceled');
  });

  describe('outcome policy', () => {
    const runs = (...reports: Array<MigrationReport | Error>) => {
      const spy = vi.spyOn(HomeserverService, 'migrateToSocialV1');
      for (const next of reports) {
        if (next instanceof Error) spy.mockRejectedValueOnce(next);
        else spy.mockResolvedValueOnce(next);
      }
      return spy;
    };
    const aborted = (code: NonNullable<MigrationReport['error']>['code'], extra: Partial<MigrationReport> = {}) =>
      report({ status: 'aborted', error: { code, message: code }, ...extra });

    it('retries an incomplete run three times on its own, then blocks on Retry', async () => {
      vi.useFakeTimers();
      const spy = runs(
        report({ status: 'incomplete' }),
        aborted('IO_ERROR'),
        report({ status: 'incomplete' }),
        report({ status: 'incomplete' }),
        report(),
      );
      const captured = vi.spyOn(Err, 'server');
      const migrating = ensure('signin');

      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(15000);
      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage()).toMatchObject({ reason: 'incomplete', attempt: 4 });
      expect(spy).toHaveBeenCalledTimes(4);
      expect(captured).toHaveBeenCalledExactlyOnceWith(
        ServerErrorCode.SERVICE_UNAVAILABLE,
        'Social migration did not finish',
        expect.objectContaining({
          operation: 'socialMigration',
          context: expect.objectContaining({ status: 'incomplete', attempt: 4 }),
        }),
      );

      SocialMigrationController.retry();
      expect(await migrating).toBe('passed');
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it('retries a blocked incomplete run when the network returns, and only that reason', async () => {
      vi.useFakeTimers();
      runs(
        report({ status: 'incomplete' }),
        report({ status: 'incomplete' }),
        report({ status: 'incomplete' }),
        report({ status: 'incomplete' }),
        report(),
      );
      const migrating = ensure('signin');
      await vi.advanceTimersByTimeAsync(22_000);
      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));

      SocialMigrationController.retryAfterReconnect();

      expect(await migrating).toBe('passed');

      runs(aborted('QUOTA', { error: { code: 'QUOTA', message: '', needBytes: 5_000_000 } }));
      const quota = ensure('signin');
      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      SocialMigrationController.retryAfterReconnect();
      await vi.advanceTimersByTimeAsync(100);
      expect(stage()).toMatchObject({ stage: 'blocked', reason: 'quota', needBytes: 5_000_000 });
      SocialMigrationController.cancel();
      expect(await quota).toBe('canceled');
    });

    it('pauses on a full homeserver until Retry', async () => {
      runs(aborted('QUOTA', { status: 'paused', error: { code: 'QUOTA', message: '', needBytes: 123 } }), report());
      const migrating = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage()).toMatchObject({ reason: 'quota', needBytes: 123 });
      SocialMigrationController.retry();

      expect(await migrating).toBe('passed');
      expect(stage().needBytes).toBeUndefined();
    });

    it('signs the account out when the session expired mid-run', async () => {
      runs(aborted('SESSION_EXPIRED'));

      expect(await ensure('signin')).toBe('reauth-required');

      expect(stage()).toMatchObject({ stage: 'reauth-required', reason: 'session-expired' });
      expect(readSocialMigrationSignedOutNotice()).toEqual({ reason: 'session-expired' });
      expect(status()).toBe('social-migration');
    });

    it('signs the account out and reports a scope refusal the adoption did not catch', async () => {
      runs(aborted('CAPS_MISSING', { error: { code: 'CAPS_MISSING', message: '', caps: '/pub/social/v1/:rw' } }));
      const captured = vi.spyOn(Err, 'auth');

      expect(await ensure('signin')).toBe('reauth-required');

      expect(stage()).toMatchObject({ stage: 'reauth-required', reason: 'missing-scopes' });
      expect(captured).toHaveBeenCalledExactlyOnceWith(
        AuthErrorCode.FORBIDDEN,
        expect.any(String),
        expect.objectContaining({ operation: 'socialMigration' }),
      );
    });

    it.each([
      ['PRIV_UNSUPPORTED', 'homeserver-unsupported'],
      ['UNSUPPORTED_EPOCH', 'unexpected'],
    ] as const)('blocks on %s as %s until Retry', async (code, reason) => {
      runs(aborted(code), report());
      const migrating = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage().reason).toBe(reason);
      SocialMigrationController.retry();

      expect(await migrating).toBe('passed');
    });

    it('blocks on a thrown engine error and captures counts only', async () => {
      runs(new Error('wasm fault'), report());
      const captured = vi.spyOn(Err, 'server');
      const migrating = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage().reason).toBe('unexpected');
      const [, , params] = captured.mock.calls[0];
      expect(params.cause).toBeInstanceOf(Error);
      expect(Object.keys(params.context ?? {})).toEqual(['attempt']);
      SocialMigrationController.retry();

      expect(await migrating).toBe('passed');
    });

    it('never puts a path, a note or a dropped value into a capture', async () => {
      runs(
        report({
          status: 'incomplete',
          skipped: { io_error: ['/pub/pubky.app/posts/secret'] },
          notes: [{ path: '/pub/pubky.app/posts/secret', message: '500' }],
          droppedValues: { 'pub/pubky.app/profile.json': ['profile_image'] },
          counts: { ...emptyCounts(), io_error: 1 },
        }),
        aborted('UNSUPPORTED_EPOCH'),
      );
      vi.useFakeTimers();
      const captured = vi.spyOn(Err, 'server');
      const migrating = ensure('signin');
      await vi.advanceTimersByTimeAsync(2000);
      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));

      const serialized = JSON.stringify(captured.mock.calls.map(([, , params]) => params.context));
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('profile_image');
      expect(serialized).not.toContain('notes');
      SocialMigrationController.cancel();
      expect(await migrating).toBe('canceled');
    });

    it('treats a run stopped by our own signal as canceled', async () => {
      runs(aborted('ABORTED'));

      expect(await ensure('signin')).toBe('canceled');
    });

    it('waits for Continue when something was left behind, and remembers it for the profile page', async () => {
      runs(
        report({
          counts: { ...emptyCounts(), written: 3, invalid: 2, not_migrated: 2 },
          droppedValues: { 'pub/pubky.app/profile.json': ['profile_image', 'profile_link[0]', 'profile_link[2]'] },
          dropped: 3,
        }),
      );
      const migrating = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('summary'));
      expect(stage().summary).toEqual({
        skipped: { invalid: 2 },
        dropped: { profileImage: 1, profileLinks: 2 },
      });
      expect(readSocialMigrationRecord(owner)?.notice).toEqual({
        skipped: { invalid: 2 },
        profileImage: 1,
        profileLinks: 2,
        pending: true,
      });
      SocialMigrationController.acknowledge();

      expect(await migrating).toBe('passed');
    });

    it('does not stop on a summary for objects with no 1.x counterpart', async () => {
      runs(report({ counts: { ...emptyCounts(), written: 1, not_migrated: 2 } }));

      expect(await ensure('signin')).toBe('passed');
      expect(readSocialMigrationRecord(owner)?.notice).toBeUndefined();
    });

    it('shows the waiting screen while another tab holds the lock', async () => {
      runs(report());
      vi.mocked(HomeserverService.migrateToSocialV1).mockImplementationOnce(async ({ onLockWait }) => {
        onLockWait?.();
        expect(stage().stage).toBe('waiting-for-tab');
        return report({ status: 'already_migrated' });
      });

      expect(await ensure('signin')).toBe('passed');
    });

    it('ignores Retry and Continue outside their stage', async () => {
      SocialMigrationController.retry();
      SocialMigrationController.acknowledge();
      SocialMigrationController.retryAfterReconnect();
      expect(stage().stage).toBe('idle');
    });
  });
});
