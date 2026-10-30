import type { Session } from '@synonymdev/pubky';
import type { ProgressEvent } from 'pubky-social-migrator';
import { memoryHomeserver } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_MIGRATION_FLAG_PATH, SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { createTestWebLocks } from '@/test-utils/web-locks';

const LEGACY_PROFILE = '/pub/pubky.app/profile.json';
const V1_PROFILE = '/pub/social/v1/profile.json';

/**
 * The real migrator (wasm included) over the in-memory homeserver. The session is passed
 * explicitly and never read from the auth store: the gate runs before the session enters it.
 */
describe('HomeserverService.migrateToSocialV1', () => {
  let homeserver: ReturnType<typeof memoryHomeserver>;
  let session: Session;
  const readJson = async (path: string) =>
    JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(path)));

  beforeEach(async () => {
    homeserver = memoryHomeserver();
    session = asOpaque<Session>(homeserver.session);
    await homeserver.session.storage.putJson(LEGACY_PROFILE, { name: 'Alice', bio: 'hi' });
    useAuthStore.getState().reset();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  it('copies the 0.x tree of the given session to social v1 and writes the flag; a second run only reads it', async () => {
    const phases: ProgressEvent['phase'][] = [];
    const report = await HomeserverService.migrateToSocialV1({
      session,
      onProgress: (event) => {
        if (phases.at(-1) !== event.phase) phases.push(event.phase);
      },
    });

    expect(report.status).toBe('done');
    expect(report.counts.written).toBe(1);
    expect(phases).toEqual(['probe', 'listing', 'migrating', 'flag', 'done']);
    expect(await readJson(V1_PROFILE)).toMatchObject({ name: 'Alice', bio: 'hi' });
    expect(await readJson(LEGACY_PROFILE)).toEqual({ name: 'Alice', bio: 'hi' });
    expect(await readJson(SOCIAL_MIGRATION_FLAG_PATH)).toMatchObject({ transform_rev: SOCIAL_MIGRATION_TRANSFORM_REV });
    // The store never saw the session
    expect(useAuthStore.getState().session).toBeNull();

    expect((await HomeserverService.migrateToSocialV1({ session })).status).toBe('already_migrated');
  });

  it('waits for the lock another tab holds instead of refusing, and reports the wait once', async () => {
    // The engine's lock name; a renamed lock would make this tab run unlocked beside the other one.
    const name = `pubky-social-migrator:${homeserver.owner}`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const otherTab = navigator.locks.request(name, () => held);
    await vi.waitFor(async () => expect((await navigator.locks.query()).held).toHaveLength(1));
    const onLockWait = vi.fn();
    let settled = false;
    const run = HomeserverService.migrateToSocialV1({ session, onLockWait }).finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(onLockWait).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release();
    await otherTab;

    expect((await run).status).toBe('done');
  });

  it('does not report a lock wait when nobody holds the lock', async () => {
    const onLockWait = vi.fn();

    await HomeserverService.migrateToSocialV1({ session, onLockWait });

    expect(onLockWait).not.toHaveBeenCalled();
  });

  it('stops when the session does not hold the migration grant', async () => {
    const narrow = asOpaque<Session>({
      ...homeserver.session,
      info: { ...homeserver.session.info, capabilities: ['/pub/pubky.app/:rw'] },
    });

    const report = await HomeserverService.migrateToSocialV1({ session: narrow });

    expect(report.error?.code).toBe('CAPS_MISSING');
    expect(await homeserver.session.storage.exists(V1_PROFILE)).toBe(false);
  });

  it('reports an abort as a report, whether the signal fired before the lock or during the run', async () => {
    const before = new AbortController();
    before.abort();
    const early = await HomeserverService.migrateToSocialV1({ session, signal: before.signal });
    expect(early.status).toBe('aborted');
    expect(early.error?.code).toBe('ABORTED');
    expect(await homeserver.session.storage.exists(V1_PROFILE)).toBe(false);

    const during = new AbortController();
    const report = await HomeserverService.migrateToSocialV1({
      session,
      signal: during.signal,
      onProgress: (event) => {
        if (event.phase === 'listing') during.abort();
      },
    });
    expect(report.status).toBe('aborted');
    expect(report.error?.code).toBe('ABORTED');
  });

  it('runs unlocked without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });

    const report = await HomeserverService.migrateToSocialV1({ session });

    expect(report.status).toBe('done');
  });
});

describe('HomeserverService.getBytesIfExists with an explicit session', () => {
  const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
  const sessionFor = (get: (path: string) => Promise<Response>): Session =>
    asOpaque<Session>({ info: { publicKey: { z32: () => owner }, capabilities: ['/:rw'] }, storage: { get } });

  afterEach(() => useAuthStore.getState().reset());

  it('reads through the given session while the store holds none', async () => {
    const get = vi.fn(async () => new Response('{"transform_rev":3}', { status: 200 }));
    useAuthStore.getState().reset();

    const result = await HomeserverService.getBytesIfExists(
      `pubky://${owner}/priv/social/v1/_migrated.json`,
      sessionFor(get),
    );

    expect(get).toHaveBeenCalledWith('/priv/social/v1/_migrated.json');
    expect(new TextDecoder().decode(result?.bytes)).toBe('{"transform_rev":3}');
  });

  it('is null on a 404 and throws on a refused read', async () => {
    const missing = sessionFor(async () => new Response(null, { status: 404 }));
    expect(
      await HomeserverService.getBytesIfExists(`pubky://${owner}/priv/social/v1/_migrated.json`, missing),
    ).toBeNull();

    const refused = sessionFor(async () => new Response('Forbidden', { status: 403 }));
    await expect(
      HomeserverService.getBytesIfExists(`pubky://${owner}/priv/social/v1/_migrated.json`, refused),
    ).rejects.toMatchObject({ context: expect.objectContaining({ statusCode: 403 }) });
  });

  it("refuses another owner's URL for the given session", async () => {
    const other = sessionFor(async () => new Response('{}', { status: 200 }));
    await expect(
      HomeserverService.getBytesIfExists('pubky://8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/priv/x', other),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
