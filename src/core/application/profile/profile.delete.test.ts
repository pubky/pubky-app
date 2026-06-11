import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalProfileService } from '@/services/local/profile/profile';

// Avoid pulling WASM-heavy deps from type-only modules
vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: vi.fn((pubky: string) => `pubky://${pubky}/pub/pubky.app/`),
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

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
  const pubky = 'test-pubky' as Pubky;
  const baseDirectory = `pubky://${pubky}/pub/pubky.app/`;
  const profileUrl = `${baseDirectory}profile.json`;

  it('deletes all files including profile.json', async () => {
    const fileList = [
      `${baseDirectory}posts/abc123`,
      `${baseDirectory}follows/user1`,
      `${baseDirectory}profile.json`,
      `${baseDirectory}tags/tag1`,
    ];

    const localDeleteSpy = vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(localDeleteSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).toHaveBeenCalledWith({ baseDirectory });
    expect(deleteSpy).toHaveBeenCalledTimes(4);

    expect(deleteSpy).toHaveBeenNthCalledWith(1, `${baseDirectory}tags/tag1`);
    expect(deleteSpy).toHaveBeenNthCalledWith(2, `${baseDirectory}posts/abc123`);
    expect(deleteSpy).toHaveBeenNthCalledWith(3, `${baseDirectory}follows/user1`);
    expect(deleteSpy).toHaveBeenNthCalledWith(4, profileUrl);
  });

  it('calls setProgress with correct percentages', async () => {
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}file2`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    const setProgress = vi.fn();
    await ProfileApplication.commitDelete({ pubky, setProgress });

    expect(setProgress).toHaveBeenNthCalledWith(1, 33);
    expect(setProgress).toHaveBeenNthCalledWith(2, 67);
    expect(setProgress).toHaveBeenNthCalledWith(3, 100);
  });

  it('works without setProgress callback', async () => {
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleteSpy).toHaveBeenCalled();
  });

  it('handles empty file list and only deletes profile.json', async () => {
    const fileList = [`${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(listSpy).toHaveBeenCalledWith({ baseDirectory });
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(profileUrl);
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

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('propagates errors when delete keeps failing after exhausting retries', async () => {
    vi.useFakeTimers();
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockRejectedValue(new Error('delete failed'));

    const commit = ProfileApplication.commitDelete({ pubky });
    const expectation = expect(commit).rejects.toThrow('delete failed');
    await vi.runAllTimersAsync();
    await expectation;

    // All attempts spent on the first file, then the flow aborts
    expect(deleteSpy).toHaveBeenCalledTimes(3);
    expect(deleteSpy).toHaveBeenCalledWith(`${baseDirectory}file1`);
  });

  it('retries a transient delete failure and completes the deletion', async () => {
    vi.useFakeTimers();
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}file2`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    const deleteSpy = vi
      .spyOn(HomeserverService, 'delete')
      .mockRejectedValueOnce(new Error('HTTP transport error: error sending request'))
      .mockResolvedValue(undefined);

    const commit = ProfileApplication.commitDelete({ pubky });
    await vi.runAllTimersAsync();
    await commit;

    // 3 files + 1 retry for the transient failure
    expect(deleteSpy).toHaveBeenCalledTimes(4);
    expect(deleteSpy).toHaveBeenLastCalledWith(profileUrl);
  });

  it('treats a 404 during delete as already removed and continues', async () => {
    const fileList = [`${baseDirectory}file1`, `${baseDirectory}file2`, `${baseDirectory}profile.json`];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
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
    expect(deleteSpy).toHaveBeenCalledTimes(3);
    expect(deleteSpy).toHaveBeenLastCalledWith(profileUrl);
  });

  it('sorts files correctly before deletion', async () => {
    const fileList = [
      `${baseDirectory}aaa`,
      `${baseDirectory}zzz`,
      `${baseDirectory}mmm`,
      `${baseDirectory}profile.json`,
    ];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(fileList);
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(deleteSpy).toHaveBeenNthCalledWith(1, `${baseDirectory}zzz`);
    expect(deleteSpy).toHaveBeenNthCalledWith(2, `${baseDirectory}mmm`);
    expect(deleteSpy).toHaveBeenNthCalledWith(3, `${baseDirectory}aaa`);
    expect(deleteSpy).toHaveBeenNthCalledWith(4, profileUrl);
  });

  it('deletes every file when the account has more than one listing page', async () => {
    // listAll handles pagination internally; commitDelete must delete the full result
    const largeFileList = [
      ...Array.from({ length: 600 }, (_, i) => `${baseDirectory}posts/post${i}`),
      `${baseDirectory}profile.json`,
    ];

    vi.spyOn(LocalProfileService, 'deleteAll').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(HomeserverService, 'listAll').mockResolvedValue(largeFileList);
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await ProfileApplication.commitDelete({ pubky });

    expect(listSpy).toHaveBeenCalledWith({ baseDirectory });
    expect(deleteSpy).toHaveBeenCalledTimes(601);
    expect(deleteSpy).toHaveBeenLastCalledWith(profileUrl);
  });
});
