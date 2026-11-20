import { decodeObject, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { BookmarkController } from './bookmark';

const USER = fakeOwner(1) as Pubky;
const URI = 'https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ';

describe('BookmarkController, external resources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(BookmarkApplication, 'persistResource').mockResolvedValue(true);
    vi.spyOn(BookmarkApplication, 'persist').mockResolvedValue(true);
  });

  it('writes a private bookmark whose file spells the link', async () => {
    await BookmarkController.commitCreateResource({ uri: URI, userId: USER });

    const [method, { bookmarkUrl, bookmarkBody }] = vi.mocked(BookmarkApplication.persistResource).mock.calls[0];
    expect(method).toBe(HttpMethod.PUT);
    expect(bookmarkUrl.startsWith(`pubky://${USER}/priv/social/v1/bookmarks/`)).toBe(true);
    const parsed = parseUri(bookmarkUrl);
    expect(parsed).toMatchObject({ kind: 'bookmark' });
    expect(parsed.kind === 'bookmark' ? parsed.target : undefined).toBe(URI);
    expect(decodeObject(bookmarkUrl, bookmarkBody!, 'bookmark').created_at).toEqual(expect.any(Number));
    // Never the local, post-only bookmark path.
    expect(BookmarkApplication.persist).not.toHaveBeenCalled();
  });

  it('deletes the same built file', async () => {
    await BookmarkController.commitCreateResource({ uri: URI, userId: USER });
    await BookmarkController.commitDeleteResource({ uri: URI, userId: USER });

    const [[, created], [method, deleted]] = vi.mocked(BookmarkApplication.persistResource).mock.calls;
    expect(method).toBe(HttpMethod.DELETE);
    expect(deleted).toEqual({ userId: USER, bookmarkUrl: created.bookmarkUrl, isCurrent: expect.any(Function) });
  });

  it('reads the viewer’s own state from the built file', async () => {
    const exists = vi.spyOn(BookmarkApplication, 'fetchResourceBookmarked').mockResolvedValue(true);

    await expect(BookmarkController.fetchResourceBookmarked({ uri: URI, userId: USER })).resolves.toBe(true);
    expect(exists.mock.calls[0][0].startsWith(`pubky://${USER}/priv/social/v1/bookmarks/`)).toBe(true);
  });
});
