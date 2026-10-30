import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileApplication } from '@/application/profile/profile';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalProfileService } from '@/services/local/profile/profile';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';

// Mock LocalProfileService
vi.mock('@/services/local/profile/profile', () => ({
  LocalProfileService: {
    deleteAll: vi.fn(),
  },
}));

const pubky = fakeOwner(1) as Pubky;
const url = (path: string) => `pubky://${pubky}${path}`;
const LEGACY_PROFILE = '/pub/pubky.app/profile.json';
const V1_PROFILE = '/pub/social/v1/profile.json';
const TREES = ['/pub/pubky.app/', '/pub/social/v1/', '/priv/social/', '/priv/app.pubky/v1/'];

describe('ProfileApplication.commitDelete', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  const seed = async (paths: string[]) => {
    for (const path of paths) await homeserver.session.storage.putJson(path, { path });
    homeserver.spies.delete.mockClear();
  };
  const deleted = () => homeserver.spies.delete.mock.calls.map(([deletedUrl]) => deletedUrl);
  const remaining = async () =>
    (await Promise.all(TREES.map((tree) => HomeserverService.listAll({ baseDirectory: url(tree) })))).flat();

  beforeEach(() => {
    vi.clearAllMocks();
    homeserver = stubMemoryHomeserver(pubky);
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sweeps the 0.x tree, the v1 trees, the whole private social root and the app namespace, profiles last', async () => {
    await seed([
      LEGACY_PROFILE,
      '/pub/pubky.app/posts/abc123',
      '/pub/pubky.app/follows/user1',
      V1_PROFILE,
      '/pub/social/v1/posts/abc123/abc123.json',
      '/pub/social/v1/tags/tag1.json',
      '/priv/social/v1/_migrated.json',
      '/priv/social/v1/bookmarks/b1.json',
      '/priv/social/unlocked/lock1/post.json',
      '/priv/social/purchases/lock1/bundle1.json',
      '/priv/app.pubky/v1/settings.json',
      '/priv/app.pubky/v1/last_read.json',
    ]);

    await ProfileApplication.commitDelete({ pubky });

    expect(LocalProfileService.deleteAll).toHaveBeenCalledTimes(1);
    expect(homeserver.spies.listAll.mock.calls.map(([params]) => params.baseDirectory)).toEqual(TREES.map(url));
    expect(deleted()).toEqual(
      [
        '/pub/social/v1/tags/tag1.json',
        '/pub/social/v1/posts/abc123/abc123.json',
        '/pub/pubky.app/posts/abc123',
        '/pub/pubky.app/follows/user1',
        '/priv/social/v1/bookmarks/b1.json',
        '/priv/social/v1/_migrated.json',
        '/priv/social/unlocked/lock1/post.json',
        '/priv/social/purchases/lock1/bundle1.json',
        '/priv/app.pubky/v1/settings.json',
        '/priv/app.pubky/v1/last_read.json',
        LEGACY_PROFILE,
        V1_PROFILE,
      ].map(url),
    );
    expect(homeserver.spies.delete).toHaveBeenLastCalledWith(url(V1_PROFILE), { singleAttempt: true });
    expect(await remaining()).toEqual([]);
  });

  it('deletes both profiles last, the 0.x one before the v1 one, even when the account has only those', async () => {
    await seed([V1_PROFILE, LEGACY_PROFILE]);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleted()).toEqual([url(LEGACY_PROFILE), url(V1_PROFILE)]);
    expect(await remaining()).toEqual([]);
  });

  it('lets an account that never wrote a tree delete without it', async () => {
    await seed([V1_PROFILE, '/pub/social/v1/follows/user1.json']);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleted()).toEqual([url('/pub/social/v1/follows/user1.json'), url(LEGACY_PROFILE), url(V1_PROFILE)]);
    expect(await remaining()).toEqual([]);
  });

  it('calls setProgress with correct percentages, the profiles counted in', async () => {
    await seed([V1_PROFILE, '/pub/social/v1/file1', '/pub/social/v1/file2']);

    const setProgress = vi.fn();
    await ProfileApplication.commitDelete({ pubky, setProgress });

    expect(setProgress.mock.calls.map(([value]) => value)).toEqual([25, 50, 100]);
  });

  it('works without setProgress callback', async () => {
    await seed([V1_PROFILE, '/pub/social/v1/file1']);

    await ProfileApplication.commitDelete({ pubky });

    expect(homeserver.spies.delete).toHaveBeenCalled();
    expect(await remaining()).toEqual([]);
  });

  it('propagates errors when local delete fails', async () => {
    vi.spyOn(LocalProfileService, 'deleteAll').mockRejectedValue(new Error('local delete failed'));

    await expect(ProfileApplication.commitDelete({ pubky })).rejects.toThrow('local delete failed');

    expect(LocalProfileService.deleteAll).toHaveBeenCalledTimes(1);
    expect(homeserver.spies.listAll).not.toHaveBeenCalled();
    expect(homeserver.spies.delete).not.toHaveBeenCalled();
  });

  it('propagates errors when a listing fails', async () => {
    homeserver.spies.listAll.mockRejectedValueOnce(new Error('list failed'));

    await expect(ProfileApplication.commitDelete({ pubky })).rejects.toThrow('list failed');

    expect(homeserver.spies.delete).not.toHaveBeenCalled();
  });

  it('propagates errors when delete keeps failing after exhausting retries', async () => {
    vi.useFakeTimers();
    await seed([V1_PROFILE, '/pub/social/v1/file1']);
    homeserver.spies.delete.mockRejectedValue(new Error('delete failed'));

    const commit = ProfileApplication.commitDelete({ pubky });
    const expectation = expect(commit).rejects.toThrow('delete failed');
    await vi.runAllTimersAsync();
    await expectation;

    // All attempts spent on the first file, then the flow aborts
    expect(homeserver.spies.delete).toHaveBeenCalledTimes(3);
    expect(homeserver.spies.delete).toHaveBeenCalledWith(url('/pub/social/v1/file1'), { singleAttempt: true });
  });

  it('retries a transient delete failure and completes the deletion', async () => {
    vi.useFakeTimers();
    await seed([V1_PROFILE, '/pub/social/v1/file1', '/pub/social/v1/file2']);
    homeserver.spies.delete.mockRejectedValueOnce(new Error('HTTP transport error: error sending request'));

    const commit = ProfileApplication.commitDelete({ pubky });
    await vi.runAllTimersAsync();
    await commit;

    // 2 files + 2 profiles + 1 retry for the transient failure
    expect(homeserver.spies.delete).toHaveBeenCalledTimes(5);
    expect(homeserver.spies.delete).toHaveBeenLastCalledWith(url(V1_PROFILE), { singleAttempt: true });
    expect(await remaining()).toEqual([]);
  });

  it('treats a 404 during delete as already removed and continues', async () => {
    await seed([V1_PROFILE, '/pub/social/v1/file1', '/pub/social/v1/file2']);
    const notFound = httpStatusCodeToError(
      404,
      'Not Found',
      ErrorService.Homeserver,
      'delete',
      url('/pub/social/v1/file2'),
    );
    homeserver.spies.delete.mockRejectedValueOnce(notFound);

    await ProfileApplication.commitDelete({ pubky });

    // No retry for the missing file; remaining files still deleted
    expect(homeserver.spies.delete).toHaveBeenCalledTimes(4);
    expect(homeserver.spies.delete).toHaveBeenLastCalledWith(url(V1_PROFILE), { singleAttempt: true });
  });

  it('sorts files in reverse order before deletion, so a directory empties deepest first', async () => {
    await seed([V1_PROFILE, '/pub/social/v1/aaa', '/pub/social/v1/zzz', '/pub/social/v1/mmm']);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleted()).toEqual(
      ['/pub/social/v1/zzz', '/pub/social/v1/mmm', '/pub/social/v1/aaa', LEGACY_PROFILE, V1_PROFILE].map(url),
    );
  });

  it('deletes every file when a tree has more than one listing page', async () => {
    // listAll handles pagination internally; commitDelete must delete the full result
    await seed([V1_PROFILE, ...Array.from({ length: 600 }, (_, i) => `/pub/social/v1/posts/post${i}/post${i}.json`)]);

    await ProfileApplication.commitDelete({ pubky });

    expect(homeserver.spies.delete).toHaveBeenCalledTimes(602);
    expect(homeserver.spies.delete).toHaveBeenLastCalledWith(url(V1_PROFILE), { singleAttempt: true });
    expect(await remaining()).toEqual([]);
  });
});
