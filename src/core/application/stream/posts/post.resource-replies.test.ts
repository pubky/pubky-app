import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import type { NexusPost } from '@/services/nexus/nexus.types';
import { NexusResourceService } from '@/services/nexus/resource/resource';
import { asInvalid } from '@/test-utils/type-assertions';

vi.mock('@/services/nexus/resource/resource', () => ({ NexusResourceService: { fetchReplies: vi.fn() } }));
vi.mock('@/services/local/stream/posts/posts', () => ({
  LocalStreamPostsService: { persistPosts: vi.fn(), getNotPersistedPostsInCache: vi.fn() },
}));
vi.mock('@/services/local/tag/tag-cache', () => ({ LocalTagCacheService: { captureRevisions: vi.fn() } }));

const RESOURCE_ID = '81cefcae5a6a468cfc27ff1c1b420fce';
const VIEWER = 'viewer';

const reply = (id: string, attachments: string[] = []): NexusPost =>
  asInvalid<NexusPost>({
    details: { id, author: 'author', attachments },
    relationships: { reposted: null },
  });

describe('PostStreamApplication.fetchResourceReplies', () => {
  // Private static: spied through the class object, which `this` resolves to.
  const statics = asInvalid<Record<string, (...args: unknown[]) => unknown>>(PostStreamApplication);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(LocalTagCacheService.captureRevisions).mockResolvedValue(asInvalid({}));
    vi.mocked(LocalStreamPostsService.persistPosts).mockResolvedValue(undefined);
    vi.mocked(LocalStreamPostsService.getNotPersistedPostsInCache).mockResolvedValue([]);
    vi.spyOn(statics, 'fetchMissingPostAuthors').mockResolvedValue(undefined);
    vi.spyOn(PostStreamApplication, 'fetchOriginalPostsByUris').mockResolvedValue(undefined);
  });

  it('stores the page and lists its replies newest first, with how many Nexus sent', async () => {
    vi.mocked(NexusResourceService.fetchReplies).mockResolvedValue([reply('b'), reply('a')]);

    const page = await PostStreamApplication.fetchResourceReplies({
      resourceId: RESOURCE_ID,
      viewerId: VIEWER,
      skip: 0,
      limit: 2,
    });

    expect(NexusResourceService.fetchReplies).toHaveBeenCalledWith({
      resourceId: RESOURCE_ID,
      viewerId: VIEWER,
      skip: 0,
      limit: 2,
    });
    expect(LocalStreamPostsService.persistPosts).toHaveBeenCalledTimes(1);
    // A full page: the list may go on.
    expect(page).toEqual({ replyIds: ['author:b', 'author:a'], fetched: 2, reachedEnd: false });
  });

  it('leaves out only the replies with files whose read by id failed, still counting them as sent', async () => {
    vi.mocked(NexusResourceService.fetchReplies).mockResolvedValue([
      reply('c', ['pubky://file']),
      reply('b'),
      reply('a'),
    ]);
    vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(false);
    vi.mocked(LocalStreamPostsService.getNotPersistedPostsInCache).mockResolvedValue(['author:c']);

    const page = await PostStreamApplication.fetchResourceReplies({
      resourceId: RESOURCE_ID,
      viewerId: VIEWER,
      skip: 0,
      limit: 5,
    });

    expect(PostStreamApplication.fetchMissingPostsFromNexus).toHaveBeenCalledWith(
      expect.objectContaining({ cacheMissPostIds: ['author:c'] }),
    );
    expect(page).toEqual({ replyIds: ['author:b', 'author:a'], fetched: 3, reachedEnd: true });
  });

  it('leaves out a reply with files the read by id did not store, though the read succeeded', async () => {
    vi.mocked(NexusResourceService.fetchReplies).mockResolvedValue([reply('c', ['pubky://file']), reply('b')]);
    vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(true);
    vi.mocked(LocalStreamPostsService.getNotPersistedPostsInCache).mockResolvedValue(['author:c']);

    const page = await PostStreamApplication.fetchResourceReplies({
      resourceId: RESOURCE_ID,
      viewerId: VIEWER,
      skip: 0,
      limit: 5,
    });

    expect(LocalStreamPostsService.getNotPersistedPostsInCache).toHaveBeenCalledWith(['author:c']);
    expect(page).toEqual({ replyIds: ['author:b'], fetched: 2, reachedEnd: true });
  });

  it('ends the list on a short page by what Nexus sent, not by the replies kept', async () => {
    vi.mocked(NexusResourceService.fetchReplies).mockResolvedValue([reply('c', ['pubky://file']), reply('b')]);
    vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(false);
    vi.mocked(LocalStreamPostsService.getNotPersistedPostsInCache).mockResolvedValue(['author:c']);

    const full = await PostStreamApplication.fetchResourceReplies({
      resourceId: RESOURCE_ID,
      viewerId: VIEWER,
      skip: 0,
      limit: 2,
    });

    expect(full).toEqual({ replyIds: ['author:b'], fetched: 2, reachedEnd: false });
  });

  it('returns null when the viewer changed meanwhile, storing nothing', async () => {
    vi.mocked(NexusResourceService.fetchReplies).mockResolvedValue([reply('a')]);

    const page = await PostStreamApplication.fetchResourceReplies({
      resourceId: RESOURCE_ID,
      viewerId: VIEWER,
      skip: 0,
      limit: 5,
      isCurrent: () => false,
    });

    expect(page).toBeNull();
    expect(LocalStreamPostsService.persistPosts).not.toHaveBeenCalled();
  });
});
