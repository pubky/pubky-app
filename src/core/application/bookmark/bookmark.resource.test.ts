import { buildBookmark } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { BookmarkApplication } from './bookmark';

const URI = 'https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ';
const OWNER = fakeOwner(1) as Pubky;
const BUILT = buildBookmark(OWNER, URI);

describe('BookmarkApplication, external resources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
    vi.spyOn(LocalBookmarkService, 'persist').mockResolvedValue(undefined);
  });

  it('lists the bookmarked links from the listing, reading only the overflow form for its link', async () => {
    const long = `https://example.com/${'a'.repeat(300)}`;
    const overflow = buildBookmark(fakeOwner(1), long);
    const post = buildBookmark(fakeOwner(1), `pubky://${fakeOwner(2)}/pub/social/v1/posts/0035V9A20WSE4`);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([BUILT.url, post.url, overflow.url, BUILT.url]);
    const getBytes = vi.spyOn(HomeserverService, 'getBytes').mockResolvedValue(overflow.body);

    await expect(BookmarkApplication.fetchResourceBookmarks(fakeOwner(1))).resolves.toEqual([URI, long]);
    expect(getBytes).toHaveBeenCalledTimes(1);
    expect(getBytes).toHaveBeenCalledWith(overflow.url);
  });

  it('leaves out an overflow bookmark whose read fails', async () => {
    const overflow = buildBookmark(fakeOwner(1), `https://example.com/${'b'.repeat(300)}`);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([overflow.url, BUILT.url]);
    vi.spyOn(HomeserverService, 'getBytes').mockRejectedValue(new Error('offline'));

    await expect(BookmarkApplication.fetchResourceBookmarks(fakeOwner(1))).resolves.toEqual([URI]);
  });

  it('reads the state from the homeserver file', async () => {
    const exists = vi.spyOn(HomeserverService, 'exists').mockResolvedValue(false);

    await expect(BookmarkApplication.fetchResourceBookmarked(BUILT.url)).resolves.toBe(false);
    expect(exists).toHaveBeenCalledWith(BUILT.url);
  });

  it('PUTs the bytes and DELETEs the file, with no local row', async () => {
    await BookmarkApplication.persistResource(HttpMethod.PUT, {
      userId: OWNER,
      bookmarkUrl: BUILT.url,
      bookmarkBody: BUILT.body,
    });
    await BookmarkApplication.persistResource(HttpMethod.DELETE, { userId: OWNER, bookmarkUrl: BUILT.url });

    expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: BUILT.url, blob: BUILT.body });
    expect(HomeserverService.deleteIdempotent).toHaveBeenCalledWith(BUILT.url);
    expect(LocalBookmarkService.persist).not.toHaveBeenCalled();
  });

  it('refuses a PUT without bytes rather than falling through to a delete', async () => {
    await expect(
      BookmarkApplication.persistResource(HttpMethod.PUT, { userId: OWNER, bookmarkUrl: BUILT.url }),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
  });

  describe('locks', () => {
    const write = (action: HttpMethod, isCurrent?: () => boolean) =>
      BookmarkApplication.persistResource(action, {
        userId: OWNER,
        bookmarkUrl: BUILT.url,
        bookmarkBody: action === HttpMethod.PUT ? BUILT.body : undefined,
        isCurrent,
      });
    const installWebLocks = () => {
      const locks = createTestWebLocks();
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      return locks;
    };

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'locks');
    });

    it('holds the user lock shared and the link’s bookmark lock exclusive, as a post bookmark write does', async () => {
      const request = vi.spyOn(installWebLocks(), 'request');

      await write(HttpMethod.PUT);

      expect(request.mock.calls.map(([name, options]) => [name, (options as LockOptions).mode])).toEqual([
        [`pubky-bookmarks-sync:${OWNER}`, 'shared'],
        [`pubky-bookmark-write:${OWNER}:${BUILT.url}`, 'exclusive'],
      ]);
    });

    it('orders a save of the link behind a delete still running, so the delete never removes the saved file', async () => {
      installWebLocks();
      const deleteLanded = Promise.withResolvers<void>();
      const order: string[] = [];
      vi.mocked(HomeserverService.deleteIdempotent).mockImplementationOnce(async () => {
        await deleteLanded.promise;
        order.push('delete');
      });
      vi.mocked(HomeserverService.putBlob).mockImplementationOnce(async () => {
        order.push('put');
      });

      const deleting = write(HttpMethod.DELETE);
      await vi.waitFor(() => expect(HomeserverService.deleteIdempotent).toHaveBeenCalledOnce());
      const saving = write(HttpMethod.PUT);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
      deleteLanded.resolve();

      await expect(Promise.all([deleting, saving])).resolves.toEqual([true, true]);
      expect(order).toEqual(['delete', 'put']);
    });

    it('writes nothing when the account changed while the write waited', async () => {
      await expect(write(HttpMethod.PUT, () => false)).resolves.toBe(false);
      await expect(write(HttpMethod.DELETE, () => false)).resolves.toBe(false);

      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
      expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
    });
  });
});
