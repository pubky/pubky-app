import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalProfileService } from '@/services/local/profile/profile';

// Mock HomeserverService methods
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    listAll: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock LocalProfileService
vi.mock('@/services/local/profile/profile', () => ({
  LocalProfileService: {
    deleteAll: vi.fn(),
  },
}));

let ProfileApplication: typeof import('./profile').ProfileApplication;
let httpStatusCodeToError: typeof import('@/libs/error/error.http').httpStatusCodeToError;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  ({ ProfileApplication } = await import('./profile'));
  // Import from the same (reset) module graph as ./profile so AppError instanceof checks match
  ({ httpStatusCodeToError } = await import('@/libs/error/error.http'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProfileApplication.commitDelete', () => {
  const pubky = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
  // The files sit in the 0.x tree; the v1 trees and the app namespace list empty
  const baseDirectory = `pubky://${pubky}/pub/pubky.app/`;
  const profileUrl = `${baseDirectory}profile.json`;
  // Both profiles go last, the 0.x one first
  const v1ProfileUrl = `pubky://${pubky}/pub/social/v1/profile.json`;
  const listing = (files: string[]) => (params: { baseDirectory: string }) =>
    Promise.resolve(params.baseDirectory === baseDirectory ? files : []);

  it('deletes all files including profile.json', async () => {
    const fileList = [
      `${baseDirectory}posts/abc123`,
      `${baseDirectory}follows/user1`,
      `${baseDirectory}profile.json`,
      `${baseDirectory}tags/tag1`,
    ];

    const localDeleteSpy = vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(localDeleteSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).toHaveBeenCalledWith({ baseDirectory });
    expect(deleteSpy).toHaveBeenCalledTimes(5);

    expect(deleteSpy).toHaveBeenNthCalledWith(1, `${baseDirectory}tags/tag1`, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(2, `${baseDirectory}posts/abc123`, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(3, `${baseDirectory}follows/user1`, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(4, profileUrl, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(5, v1ProfileUrl, { singleAttempt: true });
  });

  it('calls setProgress with correct percentages', async () => {
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}file2`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    const setProgress = vi.fn();
    await ProfileApplication.commitDelete({ pubky, setProgress });

    // Two files and two profiles
    expect(setProgress).toHaveBeenNthCalledWith(1, 25);
    expect(setProgress).toHaveBeenNthCalledWith(2, 50);
    expect(setProgress).toHaveBeenNthCalledWith(3, 100);
  });

  it('works without setProgress callback', async () => {
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleteSpy).toHaveBeenCalled();
  });

  it('handles empty file list and only deletes the profiles', async () => {
    const fileList = [`${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(listSpy).toHaveBeenCalledWith({ baseDirectory });
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenNthCalledWith(1, profileUrl, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(2, v1ProfileUrl, { singleAttempt: true });
  });

  it('propagates errors when local delete fails', async () => {
    const localDeleteSpy = vi
      .spyOn(LocalProfileService, 'deleteAll')
      .mockRejectedValue(new Error('local delete failed'));
    const listSpy = vi.spyOn(HomeserverService, 'listAll');
    const deleteSpy = vi.spyOn(HomeserverService, 'delete');

    await expect(ProfileApplication.commitDelete({ pubky })).rejects.toThrow('local delete failed');

    expect(localDeleteSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('propagates errors when list fails', async () => {
    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockRejectedValue(new Error('list failed'));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete');

    await expect(ProfileApplication.commitDelete({ pubky })).rejects.toThrow('list failed');

    expect(listSpy).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('propagates errors when delete keeps failing after exhausting retries', async () => {
    vi.useFakeTimers();
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockRejectedValue(new Error('delete failed'));

    const commit = ProfileApplication.commitDelete({ pubky });
    const expectation = expect(commit).rejects.toThrow('delete failed');
    await vi.runAllTimersAsync();
    await expectation;

    // All attempts spent on the first file, then the flow aborts
    expect(deleteSpy).toHaveBeenCalledTimes(3);
    expect(deleteSpy).toHaveBeenCalledWith(`${baseDirectory}file1`, { singleAttempt: true });
  });

  it('retries a transient delete failure and completes the deletion', async () => {
    vi.useFakeTimers();
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}file2`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const deleteSpy = vi
      .spyOn(HomeserverService, 'delete')
      .mockRejectedValueOnce(new Error('HTTP transport error: error sending request'))
      .mockResolvedValue(undefined);

    const commit = ProfileApplication.commitDelete({ pubky });
    await vi.runAllTimersAsync();
    await commit;

    // 2 files + 2 profiles + 1 retry for the transient failure
    expect(deleteSpy).toHaveBeenCalledTimes(5);
    expect(deleteSpy).toHaveBeenLastCalledWith(v1ProfileUrl, { singleAttempt: true });
  });

  it('treats a 404 during delete as already removed and continues', async () => {
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}file2`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const notFound = httpStatusCodeToError(
      404,
      'Not Found',
      ErrorService.Homeserver,
      'request',
      `${baseDirectory}file2`,
    );
    const deleteSpy = vi
      .spyOn(HomeserverService, 'delete')
      .mockRejectedValueOnce(notFound)
      .mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    // No retry for the missing file; remaining files still deleted
    expect(deleteSpy).toHaveBeenCalledTimes(4);
    expect(deleteSpy).toHaveBeenLastCalledWith(v1ProfileUrl, { singleAttempt: true });
  });

  it('sorts files correctly before deletion', async () => {
    const fileList = [
      `${baseDirectory}aaa`,
      `${baseDirectory}zzz`,
      `${baseDirectory}mmm`,
      `${baseDirectory}profile.json`,
    ];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(fileList));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleteSpy).toHaveBeenNthCalledWith(1, `${baseDirectory}zzz`, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(2, `${baseDirectory}mmm`, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(3, `${baseDirectory}aaa`, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(4, profileUrl, { singleAttempt: true });
    expect(deleteSpy).toHaveBeenNthCalledWith(5, v1ProfileUrl, { singleAttempt: true });
  });

  it('deletes every file when the account has more than one listing page', async () => {
    // listAll handles pagination internally; commitDelete must delete the full result
    const largeFileList = [
      ...Array.from({ length: 600 }, (_, i) => `${baseDirectory}posts/post${i}`),
      `${baseDirectory}profile.json`,
    ];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockImplementation(listing(largeFileList));
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(listSpy).toHaveBeenCalledWith({ baseDirectory });
    expect(deleteSpy).toHaveBeenCalledTimes(602);
    expect(deleteSpy).toHaveBeenLastCalledWith(v1ProfileUrl, { singleAttempt: true });
  });
});
