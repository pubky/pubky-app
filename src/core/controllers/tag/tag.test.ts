import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagResult } from 'pubky-app-specs';
import type { TTagEventParams } from './tag.types';
import { asOpaque } from '@/test-utils';
import { HttpMethod } from '@/libs/http/http.types';
import { TagKind } from '@/application/tag/tag.types';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
// Mock HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Mock pubky-app-specs
vi.mock('pubky-app-specs', () => ({
  PubkySpecsBuilder: class {
    createTag(_uri: string, label: string) {
      return {
        tag: { label, toJson: () => ({ label }) },
        meta: { url: `pubky://tagger/pub/pubky.app/tags/${label}` },
      };
    }
  },
  postUriBuilder: (authorId: string, postId: string) => `pubky://${authorId}/pub/pubky.app/posts/${postId}`,
  userUriBuilder: (userId: string) => `pubky://${userId}`,
}));

// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  taggerPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  taggedUserPubky: 'y4euc88xboik1ev3axy9m9ajuedo8gx1mh1n7ms8zoxm5s1b1h9y' as Pubky,
  postId: 'abc123xyz',
  get postTaggedId() {
    return buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
  get userTaggedId() {
    return this.taggedUserPubky;
  },
};

// Helper functions - Generic tag params builder
const createTagParams = (label: string, kind: TagKind): TTagEventParams => ({
  taggedId: kind === TagKind.POST ? testData.postTaggedId : testData.userTaggedId,
  label,
  taggerId: testData.taggerPubky,
  taggedKind: kind,
});

const getSavedTags = async (kind: TagKind) => {
  const id = kind === TagKind.POST ? testData.postTaggedId : testData.userTaggedId;
  const table = kind === TagKind.POST ? PostTagsModel.table : UserTagsModel.table;
  return await table.get(id);
};

const setupExistingTag = async (label: string, kind: TagKind) => {
  const id = kind === TagKind.POST ? testData.postTaggedId : testData.userTaggedId;
  const model = kind === TagKind.POST ? PostTagsModel : UserTagsModel;

  await model.create({
    id,
    tags: [
      {
        label,
        taggers: [testData.taggerPubky],
        taggers_count: 1,
        relationship: true,
      },
    ],
  });
};

describe('TagController', () => {
  let TagController: typeof import('./tag').TagController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock HomeserverService.request to resolve successfully
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    vi.spyOn(TagNormalizer, 'to').mockImplementation((uri: string, label: string, pubky: Pubky) => {
      return asOpaque<TagResult>({
        tag: { label, toJson: () => ({ label }), free: vi.fn() },
        meta: { url: `pubky://${pubky}/pub/pubky.app/tags/${label}` },
        free: vi.fn(),
      });
    });

    // Initialize database and clear tables
    await db.initialize();
    await db.transaction(
      'rw',
      [PostTagsModel.table, PostCountsModel.table, UserTagsModel.table, UserCountsModel.table],
      async () => {
        await PostTagsModel.table.clear();
        await PostCountsModel.table.clear();
        await UserTagsModel.table.clear();
        await UserCountsModel.table.clear();
      },
    );

    // Import TagController after mocks are set up
    const tagModule = await import('./tag');
    TagController = tagModule.TagController;
  });

  describe('commitCreate', () => {
    describe('POST tags', () => {
      it('should save post tag and sync to homeserver', async () => {
        await TagController.commitCreate(createTagParams('javascript', TagKind.POST));

        const savedTags = await getSavedTags(TagKind.POST);
        expect(savedTags).toBeTruthy();
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('javascript');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
        expect(savedTags!.tags[0].relationship).toBe(true);

        // Verify homeserver sync was called
        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should normalize post tag label (trim and lowercase)', async () => {
        await TagController.commitCreate(createTagParams('  JavaScript  ', TagKind.POST));

        const savedTags = await getSavedTags(TagKind.POST);
        expect(savedTags!.tags[0].label).toBe('javascript');

        // Verify homeserver sync was called
        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should rollback post tag when homeserver create fails', async () => {
        vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(new Error('Failed to PUT to homeserver: 403'));

        await expect(TagController.commitCreate(createTagParams('javascript', TagKind.POST))).rejects.toThrow(
          'Failed to PUT to homeserver: 403',
        );

        const savedTags = await getSavedTags(TagKind.POST);
        expect(savedTags?.tags ?? []).toHaveLength(0);
      });
    });

    describe('USER tags', () => {
      it('should save user tag and sync to homeserver', async () => {
        await TagController.commitCreate(createTagParams('developer', TagKind.USER));

        const savedTags = await getSavedTags(TagKind.USER);
        expect(savedTags).toBeTruthy();
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('developer');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
        expect(savedTags!.tags[0].relationship).toBe(true);

        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should normalize user tag label (trim and lowercase)', async () => {
        await TagController.commitCreate(createTagParams('  Developer  ', TagKind.USER));

        const savedTags = await getSavedTags(TagKind.USER);
        expect(savedTags!.tags[0].label).toBe('developer');

        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should rollback user tag when homeserver create fails', async () => {
        vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(new Error('Failed to PUT to homeserver: 403'));

        await expect(TagController.commitCreate(createTagParams('developer', TagKind.USER))).rejects.toThrow(
          'Failed to PUT to homeserver: 403',
        );

        const savedTags = await getSavedTags(TagKind.USER);
        expect(savedTags?.tags ?? []).toHaveLength(0);
      });
    });
  });

  describe('commitDelete', () => {
    describe('POST tags', () => {
      beforeEach(async () => {
        await setupExistingTag('javascript', TagKind.POST);
      });

      it('should remove post tag and sync to homeserver', async () => {
        await TagController.commitDelete(createTagParams('javascript', TagKind.POST));

        const savedTags = await getSavedTags(TagKind.POST);
        expect(savedTags!.tags).toHaveLength(0);

        // Verify homeserver sync was called
        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should normalize post tag label (trim and lowercase)', async () => {
        await TagController.commitDelete(createTagParams('  JavaScript  ', TagKind.POST));

        const savedTags = await getSavedTags(TagKind.POST);
        expect(savedTags!.tags).toHaveLength(0);

        // Verify homeserver sync was called
        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should rollback post tag when homeserver delete fails', async () => {
        vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(
          new Error('Failed to DELETE from homeserver: 403'),
        );

        await expect(TagController.commitDelete(createTagParams('javascript', TagKind.POST))).rejects.toThrow(
          'Failed to DELETE from homeserver: 403',
        );

        const savedTags = await getSavedTags(TagKind.POST);
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('javascript');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
      });
    });

    describe('USER tags', () => {
      beforeEach(async () => {
        await setupExistingTag('developer', TagKind.USER);
      });

      it('should remove user tag and sync to homeserver', async () => {
        await TagController.commitDelete(createTagParams('developer', TagKind.USER));

        const savedTags = await getSavedTags(TagKind.USER);
        expect(savedTags!.tags).toHaveLength(0);

        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should normalize user tag label (trim and lowercase)', async () => {
        await TagController.commitDelete(createTagParams('  Developer  ', TagKind.USER));

        const savedTags = await getSavedTags(TagKind.USER);
        expect(savedTags!.tags).toHaveLength(0);

        expect(HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should rollback user tag when homeserver delete fails', async () => {
        vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(
          new Error('Failed to DELETE from homeserver: 403'),
        );

        await expect(TagController.commitDelete(createTagParams('developer', TagKind.USER))).rejects.toThrow(
          'Failed to DELETE from homeserver: 403',
        );

        const savedTags = await getSavedTags(TagKind.USER);
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('developer');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
      });
    });
  });
});
