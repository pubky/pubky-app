import type { Session } from '@synonymdev/pubky';
import { memoryHomeserver } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { createTestWebLocks } from '@/test-utils/web-locks';

const LEGACY_PROFILE = '/pub/pubky.app/profile.json';
const V1_PROFILE = '/pub/social/v1/profile.json';

describe('HomeserverService.migrateToSocialV1', () => {
  let homeserver: ReturnType<typeof memoryHomeserver>;
  const readJson = async (path: string) =>
    JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(path)));

  beforeEach(async () => {
    homeserver = memoryHomeserver();
    await homeserver.session.storage.putJson(LEGACY_PROFILE, { name: 'Alice', bio: 'hi' });
    useAuthStore.getState().init({
      session: asOpaque<Session>(homeserver.session),
      currentUserPubky: homeserver.owner as Pubky,
      hasProfile: true,
    });
    Object.defineProperty(navigator, 'locks', { configurable: true, value: createTestWebLocks() });
  });

  afterEach(() => {
    useAuthStore.getState().reset();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  it('copies the 0.x tree of the signed-in user to social v1, and a second run only reads the flag', async () => {
    const report = await HomeserverService.migrateToSocialV1({});

    expect(report.status).toBe('done');
    expect(report.counts.written).toBe(1);
    expect(await readJson(V1_PROFILE)).toMatchObject({ name: 'Alice', bio: 'hi' });
    expect(await readJson(LEGACY_PROFILE)).toEqual({ name: 'Alice', bio: 'hi' });

    expect((await HomeserverService.migrateToSocialV1({})).status).toBe('already_migrated');
  });

  it('runs once per account across tabs', async () => {
    const [first, second] = await Promise.all([
      HomeserverService.migrateToSocialV1({}),
      HomeserverService.migrateToSocialV1({}),
    ]);

    expect([first.status, second.status].sort()).toEqual(['aborted', 'done']);
    expect([first, second].find((report) => report.status === 'aborted')?.error?.code).toBe('ALREADY_RUNNING');
  });

  it('stops when the session does not hold the migration grant', async () => {
    useAuthStore.getState().init({
      session: asOpaque<Session>({ ...homeserver.session, info: { ...homeserver.session.info, capabilities: [] } }),
      currentUserPubky: homeserver.owner as Pubky,
      hasProfile: true,
    });

    const report = await HomeserverService.migrateToSocialV1({});

    expect(report.error?.code).toBe('CAPS_MISSING');
    expect(await homeserver.session.storage.exists(V1_PROFILE)).toBe(false);
  });

  it('needs a signed-in session', async () => {
    useAuthStore.getState().reset();

    await expect(HomeserverService.migrateToSocialV1({})).rejects.toMatchObject({ message: 'No signed-in session' });
  });
});
