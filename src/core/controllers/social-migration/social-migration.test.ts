import type { Session } from '@synonymdev/pubky';
import type { MigrationReport, Outcome } from 'pubky-social-migrator';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { SOCIAL_MIGRATION_FLAG_PATH, SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import {
  readSocialMigrationRecord,
  socialMigrationRecordKey,
  writeSocialMigrationRecord,
} from '@/libs/social-migration/record';
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

// The automatic retries without their waits, for the runs that need them over the real engine
const retry = vi.hoisted(() => ({ immediate: false }));
vi.mock('@/config/social-migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/social-migration')>();
  return {
    ...actual,
    get SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS() {
      return retry.immediate ? [0, 0, 0] : actual.SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS;
    },
  };
});

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
    retry.immediate = false;
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

  it('resumes a restore whose record saw an older revision, whatever its grant: the flag is read again and the tree re-walked', async () => {
    await seedLegacyTree();
    await homeserver.session.storage.putJson(SOCIAL_MIGRATION_FLAG_PATH, {
      migrated_at: 1,
      transform_rev: SOCIAL_MIGRATION_TRANSFORM_REV - 1,
      skipped: {},
      migrated: [],
    });
    writeSocialMigrationRecord(owner, { v: 1, migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV - 1, admittedGrantIds: [] });
    const read = vi.spyOn(HomeserverService, 'getBytesIfExists');
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');

    expect(await ensure('restore')).toBe('passed');

    expect(read).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    expect(stage().stage).toBe('idle');
    const flag = JSON.parse(
      new TextDecoder().decode(await homeserver.session.storage.getBytes(SOCIAL_MIGRATION_FLAG_PATH)),
    );
    expect(flag.transform_rev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
    expect(readSocialMigrationRecord(owner)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
  });

  it('signs out a restore whose record never saw the flag and did not admit its grant (D2)', async () => {
    await seedLegacyTree();
    writeSocialMigrationRecord(owner, { v: 1, admittedGrantIds: ['another-grant'] });
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');

    expect(await ensure('restore')).toBe('reauth-required');

    expect(run).not.toHaveBeenCalled();
    expect(stage()).toMatchObject({ stage: 'reauth-required', reason: 'pre-migration-grant' });
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

  it('throws a timeout to the caller when the flag read never answers, without running the engine', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    homeserver.spies.getBytesIfExists.mockReturnValueOnce(new Promise(() => {}));
    const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');
    const gate = ensure('restore').then(
      () => null,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

    expect(await gate).toMatchObject({
      category: ErrorCategory.Timeout,
      code: TimeoutErrorCode.REQUEST_TIMEOUT,
      operation: 'readMigrationFlag',
    });
    expect(run).not.toHaveBeenCalled();
    expect(status()).toBe('restoring');
    expect(stage()).toMatchObject({ stage: 'idle' });
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
    expect(stage().stage).toBe('idle');
  });

  describe('profile values a run dropped', () => {
    // `mailto:` has no 1.x counterpart: the engine writes the profile without it and reports `profile_link[1]`
    const seedProfileWithDroppedLink = async () => {
      await seedLegacyTree();
      await homeserver.session.storage.putJson('/pub/pubky.app/profile.json', {
        name: 'Alice',
        bio: 'hi',
        links: [
          { title: 'site', url: 'https://example.com' },
          { title: 'mail', url: 'mailto:alice@example.com' },
        ],
      });
    };
    /** The session with the first object read under `match` failing as `error`, once. */
    const sessionFailingOnce = (match: string, error: () => Error) => {
      const { storage } = homeserver.session;
      let failed = false;
      const guard = (path: string) => {
        if (failed || !path.includes(match)) return;
        failed = true;
        throw error();
      };
      return asOpaque<Session>({
        ...homeserver.session,
        info: { ...homeserver.session.info, capabilities: ['/:rw'] },
        storage: {
          ...storage,
          get: async (path: string) => {
            guard(path);
            return storage.get(path);
          },
          getBytes: async (path: string) => {
            guard(path);
            return storage.getBytes(path);
          },
        },
      });
    };
    // The SDK error the port counts as one `io_error` for the object, which the engine does not retry
    const internalError = () => Object.assign(new Error('read failed'), { name: 'InternalError' });
    const recordWrites = () => {
      const key = socialMigrationRecordKey(owner);
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      return () =>
        setItem.mock.calls
          .filter(([written]) => written === key)
          .map(([, value]) => JSON.parse(value) as NonNullable<ReturnType<typeof readSocialMigrationRecord>>);
    };

    it('keeps the profile values an incomplete run dropped through the automatic retry', async () => {
      retry.immediate = true;
      await seedProfileWithDroppedLink();
      const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');
      const writes = recordWrites();
      const migrating = ensure('signin', sessionFailingOnce('/follows/', internalError));

      await vi.waitFor(() => expect(stage().stage).toBe('summary'));
      expect(run).toHaveBeenCalledTimes(2);
      expect(stage().summary).toEqual({ skipped: {}, dropped: { profileImage: 0, profileLinks: 1 } });
      expect(readSocialMigrationRecord(owner)?.notice).toEqual({
        skipped: {},
        profileImage: 0,
        profileLinks: 1,
        pending: true,
      });
      // The run that writes the notice clears what the gate remembered, in the same write
      expect(readSocialMigrationRecord(owner)?.droppedProfile).toBeUndefined();
      const notices = writes().filter(
        (record, index, all) => JSON.stringify(record.notice) !== JSON.stringify(all[index - 1]?.notice),
      );
      expect(notices).toHaveLength(1);
      SocialMigrationController.acknowledge();

      expect(await migrating).toBe('passed');
      expect(SocialMigrationController.getPendingProfileNotice(owner)).toEqual({ profileImage: 0, profileLinks: 1 });
    });

    it('raises the note when a later gate resumes after a reload', async () => {
      await seedProfileWithDroppedLink();
      const first = ensure('signin', sessionFailingOnce('/follows/', internalError));
      // The tab closes during the back-off after the incomplete run
      await vi.waitFor(() => expect(readSocialMigrationRecord(owner)?.lastRun?.status).toBe('incomplete'));
      SocialMigrationController.cancel();
      expect(await first).toBe('canceled');
      expect(readSocialMigrationRecord(owner)?.migratedRev).toBeUndefined();

      const restore = ensure('restore');

      await vi.waitFor(() => expect(stage().stage).toBe('summary'));
      expect(stage().summary?.dropped).toEqual({ profileImage: 0, profileLinks: 1 });
      SocialMigrationController.acknowledge();
      expect(await restore).toBe('passed');
      expect(SocialMigrationController.getPendingProfileNotice(owner)).toEqual({ profileImage: 0, profileLinks: 1 });
    });

    it('keeps them across a session expiry after the profile pass', async () => {
      await seedProfileWithDroppedLink();
      // Mutes are walked after the profile
      await homeserver.session.storage.putJson(`/pub/pubky.app/mutes/${fakeOwner(9)}`, { created_at: 4 });
      const expired = () => Object.assign(new Error('session expired'), { name: 'AuthenticationError' });

      expect(await ensure('signin', sessionFailingOnce('/mutes/', expired))).toBe('reauth-required');
      expect(stage()).toMatchObject({ stage: 'reauth-required', reason: 'session-expired' });
      expect(await homeserver.session.storage.exists('/pub/social/v1/profile.json')).toBe(true);
      SocialMigrationController.cancel();

      const signin = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('summary'));
      expect(stage().summary?.dropped).toEqual({ profileImage: 0, profileLinks: 1 });
      SocialMigrationController.acknowledge();
      expect(await signin).toBe('passed');
      expect(SocialMigrationController.getPendingProfileNotice(owner)).toEqual({ profileImage: 0, profileLinks: 1 });
    });

    it('forgets them when a restore passes on the flag of a run elsewhere, so a later re-walk does not show them', async () => {
      await homeserver.session.storage.putJson(SOCIAL_MIGRATION_FLAG_PATH, {
        migrated_at: 1,
        transform_rev: SOCIAL_MIGRATION_TRANSFORM_REV,
        skipped: {},
        migrated: [],
      });
      writeSocialMigrationRecord(owner, {
        v: 1,
        admittedGrantIds: [GRANT],
        droppedProfile: { profileImage: 0, profileLinks: 1 },
      });

      expect(await ensure('restore')).toBe('passed');

      expect(readSocialMigrationRecord(owner)).toEqual({
        v: 1,
        admittedGrantIds: [GRANT],
        migratedRev: SOCIAL_MIGRATION_TRANSFORM_REV,
      });
    });

    it('merges the remembered profile values by the larger count and takes the skipped items from the last run only', async () => {
      const spy = vi.spyOn(HomeserverService, 'migrateToSocialV1');
      spy.mockResolvedValueOnce(
        report({
          status: 'incomplete',
          counts: { ...emptyCounts(), invalid: 2, io_error: 1 },
          droppedValues: { 'pub/pubky.app/profile.json': ['profile_image', 'profile_link[0]', 'profile_link[1]'] },
          dropped: 3,
        }),
      );
      spy.mockResolvedValueOnce(
        report({
          counts: { ...emptyCounts(), invalid: 1 },
          droppedValues: { 'pub/pubky.app/profile.json': ['profile_link[2]'] },
          dropped: 1,
        }),
      );
      vi.useFakeTimers();
      const migrating = ensure('signin');
      await vi.advanceTimersByTimeAsync(2000);

      await vi.waitFor(() => expect(stage().stage).toBe('summary'));
      expect(stage().summary).toEqual({ skipped: { invalid: 1 }, dropped: { profileImage: 1, profileLinks: 2 } });
      expect(readSocialMigrationRecord(owner)).toMatchObject({
        notice: { skipped: { invalid: 1 }, profileImage: 1, profileLinks: 2, pending: true },
      });
      expect(readSocialMigrationRecord(owner)?.droppedProfile).toBeUndefined();
      SocialMigrationController.acknowledge();
      expect(await migrating).toBe('passed');
    });
  });

  describe('while it waits to retry', () => {
    /** The session with every `method` call under `match` failing as the browser's fetch does offline. */
    const sessionOffline = (method: 'get' | 'exists', match: string) => {
      const { storage } = homeserver.session;
      const original = storage[method].bind(storage) as (path: string) => Promise<unknown>;
      return asOpaque<Session>({
        ...homeserver.session,
        info: { ...homeserver.session.info, capabilities: ['/:rw'] },
        storage: {
          ...storage,
          [method]: async (path: string) => {
            if (path.includes(match)) throw new TypeError('Failed to fetch');
            return original(path);
          },
        },
      });
    };
    const phases = () => {
      const seen: Array<string | undefined> = [];
      const unsubscribe = useSocialMigrationStore.subscribe((state) => {
        if (seen.at(-1) !== state.phase) seen.push(state.phase);
      });
      return { seen, unsubscribe };
    };
    /** Advances the engine's own transport retries until the run reports, then stays inside the gate's first wait. */
    const untilFirstReport = async () => {
      const reported = () => !['running', undefined].includes(readSocialMigrationRecord(owner)?.lastRun?.status);
      for (let elapsed = 0; !reported(); elapsed += 100) {
        if (elapsed > 120_000) throw new Error('the run never reported');
        await vi.advanceTimersByTimeAsync(100);
      }
    };

    it('keeps the stopped step in the store while it waits to retry an incomplete run', async () => {
      vi.useFakeTimers();
      await homeserver.session.storage.putJson('/pub/pubky.app/profile.json', { name: 'Alice', bio: 'hi' });
      await homeserver.session.storage.putJson(`/pub/pubky.app/follows/${homeserver.friend}`, { created_at: 1 });
      const run = vi.spyOn(HomeserverService, 'migrateToSocialV1');
      const { seen, unsubscribe } = phases();
      const migrating = ensure('signin', sessionOffline('get', '/follows/'));

      await untilFirstReport();
      unsubscribe();

      expect(readSocialMigrationRecord(owner)?.lastRun?.status).toBe('incomplete');
      expect(run).toHaveBeenCalledOnce();
      expect(stage()).toMatchObject({ stage: 'running', phase: 'migrating', attempt: 1, total: 2 });
      expect(stage().done).toBeGreaterThan(0);
      expect(seen).not.toContain('incomplete');
      SocialMigrationController.cancel();
      expect(await migrating).toBe('canceled');
    });

    it('keeps the probe step while it waits to retry an unreachable homeserver', async () => {
      vi.useFakeTimers();
      await seedLegacyTree();
      const { seen, unsubscribe } = phases();
      const migrating = ensure('signin', sessionOffline('exists', '/'));

      await untilFirstReport();
      unsubscribe();

      expect(readSocialMigrationRecord(owner)?.lastRun).toMatchObject({
        status: 'aborted',
        error: { code: 'IO_ERROR' },
      });
      expect(stage()).toMatchObject({ stage: 'running', phase: 'probe', attempt: 1 });
      expect(seen).not.toContain('aborted');
      SocialMigrationController.cancel();
      expect(await migrating).toBe('canceled');
    });
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

    it('blocks on a thrown engine error and captures its shape only', async () => {
      runs(new Error('wasm fault at /pub/pubky.app/posts/secret'), report());
      const captured = vi.spyOn(Err, 'server');
      const migrating = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage().reason).toBe('unexpected');
      const [, , params] = captured.mock.calls[0];
      expect(params).not.toHaveProperty('cause');
      expect(params.context).toEqual({ attempt: 1, errorName: 'Error', kind: undefined, status: undefined });
      expect(JSON.stringify(captured.mock.calls)).not.toContain('secret');
      SocialMigrationController.retry();

      expect(await migrating).toBe('passed');
    });

    it('blocks a run whose engine chunk could not be fetched as unreachable, reports it once and retries on reconnect', async () => {
      // What `HomeserverService.migrateToSocialV1` throws, uncaptured, when the import rejects
      const loadFailure = () =>
        new AppError({
          category: ErrorCategory.Network,
          code: NetworkErrorCode.CONNECTION_FAILED,
          message: 'Could not load the migration engine',
          service: ErrorService.Homeserver,
          operation: 'migrateToSocialV1',
          cause: new TypeError('Failed to fetch dynamically imported module'),
        });
      runs(loadFailure(), loadFailure(), report());
      const network = vi.spyOn(Err, 'network');
      const server = vi.spyOn(Err, 'server');
      const migrating = ensure('signin');

      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage().reason).toBe('incomplete');
      SocialMigrationController.retryAfterReconnect();
      await vi.waitFor(() => expect(stage().attempt).toBe(2));
      await vi.waitFor(() => expect(stage().stage).toBe('blocked'));
      expect(stage().reason).toBe('incomplete');
      // Captured once for the account, with the import rejection as the cause; the second failure is not filed again
      expect(network).toHaveBeenCalledOnce();
      expect(network.mock.calls[0][2]).toMatchObject({
        operation: 'socialMigration',
        cause: expect.any(TypeError),
        context: { attempt: 1, errorName: 'TypeError' },
      });
      expect(server).not.toHaveBeenCalled();
      SocialMigrationController.retry();

      expect(await migrating).toBe('passed');
      expect(readSocialMigrationRecord(owner)?.migratedRev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
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
      // The profile edit page shows its note until it is dismissed or the profile saved
      expect(SocialMigrationController.getPendingProfileNotice(owner)).toEqual({ profileImage: 1, profileLinks: 2 });
      SocialMigrationController.acknowledgeProfileNotice(owner);
      expect(SocialMigrationController.getPendingProfileNotice(owner)).toBeNull();
      expect(readSocialMigrationRecord(owner)?.notice).toEqual({
        skipped: { invalid: 2 },
        profileImage: 1,
        profileLinks: 2,
        pending: false,
      });
      expect(SocialMigrationController.hasPassedLocally(owner)).toBe(true);
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
