import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { generateTestUserId } from '@/models/user/users.helpers';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';

/**
 * Two labels are one tag locally exactly when `pubky-social-specs` stores them as one tag file: the
 * fold is trim plus ASCII lowercase (`canonicalizeTagLabel`), so `xÄpfel` and `xäpfel` are two tags
 * with two addresses, while `Bitcoin` and `BITCOIN` are one.
 */
const viewer = generateTestUserId(1);
const taggedPost = `${generateTestUserId(2)}:0032abc`;
const entity = { kind: 'post', id: taggedPost } as const;
const uriOf = (id: string) => `pubky://${viewer}/pub/social/v1/tags/${id}.json`;

describe('tag labels that differ only outside ASCII', () => {
  beforeEach(async () => {
    await resetDatabase();
    await UserCountsModel.create({
      id: viewer,
      tagged: 0,
      tags: 0,
      unique_tags: 0,
      posts: 0,
      replies: 0,
      collections: 0,
      following: 0,
      followers: 0,
      friends: 0,
      bookmarks: 0,
    });
    await PostCountsModel.create({ id: taggedPost, tags: 0, unique_tags: 0, replies: 0, reposts: 0, collections: 0 });
  });

  it('creates two tags with two addresses, and removing one leaves the other with its address', async () => {
    const upper = { taggerId: viewer, taggedId: taggedPost, label: 'xÄpfel', tagUri: uriOf('UPPER') };
    const lower = { taggerId: viewer, taggedId: taggedPost, label: 'xäpfel', tagUri: uriOf('LOWER') };

    expect(await LocalPostTagService.create({ ...upper, mutationId: 'a' })).toBe(true);
    expect(await LocalPostTagService.create({ ...lower, mutationId: 'b' })).toBe(true);

    expect((await PostTagsModel.findById(taggedPost))?.tags.map((tag) => tag.label)).toEqual(['xÄpfel', 'xäpfel']);
    await expect(LocalTagCacheService.getViewerTagUri(entity, 'xÄpfel', viewer)).resolves.toBe(uriOf('UPPER'));
    await expect(LocalTagCacheService.getViewerTagUri(entity, 'xäpfel', viewer)).resolves.toBe(uriOf('LOWER'));
    expect((await LocalTagCacheService.getViewerMutations(entity, viewer)).size).toBe(2);

    expect(await LocalPostTagService.delete({ ...upper, mutationId: 'c' })).toBe(true);

    const row = await PostTagsModel.findById(taggedPost);
    expect(row?.tags.map((tag) => tag.label)).toEqual(['xäpfel']);
    await expect(LocalTagCacheService.getViewerTagUri(entity, 'xÄpfel', viewer)).resolves.toBeUndefined();
    await expect(LocalTagCacheService.getViewerTagUri(entity, 'xäpfel', viewer)).resolves.toBe(uriOf('LOWER'));
    expect(await PostCountsModel.findById(taggedPost)).toMatchObject({ tags: 1, unique_tags: 1 });
  });

  it('still treats ASCII case variants as one tag', async () => {
    const write = { taggerId: viewer, taggedId: taggedPost, label: 'Bitcoin', tagUri: uriOf('BTC') };

    expect(await LocalPostTagService.create({ ...write, mutationId: 'a' })).toBe(true);
    expect(await LocalPostTagService.create({ ...write, label: 'BITCOIN', mutationId: 'b' })).toBe(false);

    expect((await PostTagsModel.findById(taggedPost))?.tags).toHaveLength(1);
    await expect(LocalTagCacheService.getViewerTagUri(entity, 'BITCOIN', viewer)).resolves.toBe(uriOf('BTC'));
  });
});
