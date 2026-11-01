import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { generateTestUserId } from '@/models/user/users.helpers';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

/**
 * The undo of a rejected homeserver write runs against the real database without a session
 * fence (#2954): it must restore tags and counts exactly, and must stay bound to the operation
 * that made the write, so a database cleared for another account is left untouched.
 */
const viewer = generateTestUserId(1);
const taggedUser = generateTestUserId(2);
const taggedPost = `${taggedUser}:0032abc`;
const label = 'bitcoin';
const viewerCounts = {
  id: viewer,
  tagged: 3,
  tags: 0,
  unique_tags: 0,
  posts: 0,
  replies: 0,
  collections: 0,
  following: 0,
  followers: 0,
  friends: 0,
  bookmarks: 0,
};

describe.each([
  {
    kind: 'post',
    local: LocalPostTagService,
    tags: PostTagsModel,
    taggedId: taggedPost,
    seedCounts: (tags: number) =>
      PostCountsModel.create({ id: taggedPost, tags, unique_tags: tags, replies: 0, reposts: 0, collections: 0 }),
    readCounts: async () => {
      const counts = await PostCountsModel.findById(taggedPost);
      return counts ? { tags: counts.tags, unique_tags: counts.unique_tags } : null;
    },
  },
  {
    kind: 'user',
    local: LocalUserTagService,
    tags: UserTagsModel,
    taggedId: taggedUser,
    seedCounts: (tags: number) =>
      UserCountsModel.create({ ...viewerCounts, id: taggedUser, tagged: 0, tags, unique_tags: tags }),
    readCounts: async () => {
      const counts = await UserCountsModel.findById(taggedUser);
      return counts ? { tags: counts.tags, unique_tags: counts.unique_tags } : null;
    },
  },
])('rejected $kind tag write rollback', ({ local, tags, taggedId, seedCounts, readCounts }) => {
  const write = { taggerId: viewer, taggedId, label };
  const undoOf = (mutationId: string) => ({
    ...write,
    mutationId: 'undo',
    expectedMutationId: mutationId,
    synced: true,
  });
  const readViewerTagged = async () => (await UserCountsModel.findById(viewer))?.tagged;

  beforeEach(async () => {
    await resetDatabase();
    await UserCountsModel.create(viewerCounts);
  });

  it('undoes an optimistic create and restores every count', async () => {
    await seedCounts(0);
    expect(await local.create({ ...write, mutationId: 'op', isCurrent: () => true })).toBe(true);
    expect(await readCounts()).toEqual({ tags: 1, unique_tags: 1 });

    expect(await local.delete(undoOf('op'))).toBe(true);

    const row = await tags.findById(taggedId);
    expect(row?.tags.find((tag) => tag.label === label)).toBeUndefined();
    expect(row?.mutations?.[`${viewer}:${label}`]).toMatchObject({ id: 'undo', relationship: false, synced: true });
    expect(await readCounts()).toEqual({ tags: 0, unique_tags: 0 });
    expect(await readViewerTagged()).toBe(3);
  });

  it('restores an optimistically removed tag with its counts', async () => {
    await seedCounts(1);
    await tags.create({
      id: taggedId,
      tags: [{ label, taggers: [viewer], taggers_count: 1, relationship: true }],
    });
    expect(await local.delete({ ...write, mutationId: 'op', isCurrent: () => true })).toBe(true);
    expect(await readCounts()).toEqual({ tags: 0, unique_tags: 0 });

    expect(await local.create(undoOf('op'))).toBe(true);

    const row = await tags.findById(taggedId);
    expect(row?.tags.find((tag) => tag.label === label)).toMatchObject({ taggers: [viewer], taggers_count: 1 });
    expect(row?.mutations?.[`${viewer}:${label}`]).toMatchObject({ id: 'undo', relationship: true, synced: true });
    expect(await readCounts()).toEqual({ tags: 1, unique_tags: 1 });
    expect(await readViewerTagged()).toBe(3);
  });

  it('leaves a database cleared for another account untouched', async () => {
    await resetDatabase();
    expect(await local.delete(undoOf('op'))).toBe(false);
    expect(await local.create(undoOf('op'))).toBe(false);
    expect(await tags.findById(taggedId)).toBeNull();
    expect(await readCounts()).toBeNull();
  });

  it("does not touch another account's freshly loaded row", async () => {
    await seedCounts(1);
    const loaded = { id: taggedId, tags: [{ label, taggers: [viewer], taggers_count: 1, relationship: false }] };
    await tags.create(loaded);

    expect(await local.delete(undoOf('op'))).toBe(false);

    expect(await tags.findById(taggedId)).toMatchObject(loaded);
    expect(await readCounts()).toEqual({ tags: 1, unique_tags: 1 });
    expect(await readViewerTagged()).toBe(3);
  });
});
