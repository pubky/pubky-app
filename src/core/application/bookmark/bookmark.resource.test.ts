import { buildBookmark } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { BookmarkApplication } from './bookmark';

const URI = 'https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ';
const BUILT = buildBookmark(fakeOwner(1), URI);

describe('BookmarkApplication, external resources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
    vi.spyOn(LocalBookmarkService, 'persist').mockResolvedValue(undefined);
  });

  it('reads the state from the homeserver file', async () => {
    const exists = vi.spyOn(HomeserverService, 'exists').mockResolvedValue(false);

    await expect(BookmarkApplication.fetchResourceBookmarked(BUILT.url)).resolves.toBe(false);
    expect(exists).toHaveBeenCalledWith(BUILT.url);
  });

  it('PUTs the bytes and DELETEs the file, with no local row', async () => {
    await BookmarkApplication.persistResource(HttpMethod.PUT, { bookmarkUrl: BUILT.url, bookmarkBody: BUILT.body });
    await BookmarkApplication.persistResource(HttpMethod.DELETE, { bookmarkUrl: BUILT.url });

    expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: BUILT.url, blob: BUILT.body });
    expect(HomeserverService.deleteIdempotent).toHaveBeenCalledWith(BUILT.url);
    expect(LocalBookmarkService.persist).not.toHaveBeenCalled();
  });

  it('refuses a PUT without bytes rather than falling through to a delete', async () => {
    await expect(
      BookmarkApplication.persistResource(HttpMethod.PUT, { bookmarkUrl: BUILT.url }),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
  });
});
