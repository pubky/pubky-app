import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagResult } from 'pubky-app-specs';
import * as Core from '@/core';
import type { TTagEventParams } from './tag.types';
import { asOpaque } from '@/test-utils';
import { HttpMethod } from '@/libs/http/http.types';

// Mock HomeserverService
vi.mock('@/core/services/homeserver', () => ({
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
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Core.Pubky,
  taggerPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky,
  taggedUserPubky: 'y4euc88xboik1ev3axy9m9ajuedo8gx1mh1n7ms8zoxm5s1b1h9y' as Core.Pubky,
  postId: 'abc123xyz',
  get postTaggedId() {
    return Core.buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
  get userTaggedId() {
    return this.taggedUserPubky;
  },
};

// Helper functions - Generic tag params builder
const createTagParams = (label: string, kind: Core.TagKind): TTagEventParams => ({
  taggedId: kind === Core.TagKind.POST ? testData.postTaggedId : testData.userTaggedId,
  label,
  taggerId: testData.taggerPubky,
  taggedKind: kind,
});

const getSavedTags = async (kind: Core.TagKind) => {
  const id = kind === Core.TagKind.POST ? testData.postTaggedId : testData.userTaggedId;
  const table = kind === Core.TagKind.POST ? Core.PostTagsModel.table : Core.UserTagsModel.table;
  return await table.get(id);
};

const setupExistingTag = async (label: string, kind: Core.TagKind) => {
  const id = kind === Core.TagKind.POST ? testData.postTaggedId : testData.userTaggedId;
  const model = kind === Core.TagKind.POST ? Core.PostTagsModel : Core.UserTagsModel;

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
    vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined);

    vi.spyOn(Core.TagNormalizer, 'to').mockImplementation((uri: string, label: string, pubky: Core.Pubky) => {
      return asOpaque<TagResult>({
        tag: { label, toJson: () => ({ label }), free: vi.fn() },
        meta: { url: `pubky://${pubky}/pub/pubky.app/tags/${label}` },
        free: vi.fn(),
      });
    });

    // Initialize database and clear tables
    await Core.db.initialize();
    await Core.db.transaction(
      'rw',
      [Core.PostTagsModel.table, Core.PostCountsModel.table, Core.UserTagsModel.table, Core.UserCountsModel.table],
      async () => {
        await Core.PostTagsModel.table.clear();
        await Core.PostCountsModel.table.clear();
        await Core.UserTagsModel.table.clear();
        await Core.UserCountsModel.table.clear();
      },
    );

    // Import TagController after mocks are set up
    const tagModule = await import('./tag');
    TagController = tagModule.TagController;
  });

  describe('commitCreate', () => {
    describe('POST tags', () => {
      it('should save post tag and sync to homeserver', async () => {
        await TagController.commitCreate(createTagParams('javascript', Core.TagKind.POST));

        const savedTags = await getSavedTags(Core.TagKind.POST);
        expect(savedTags).toBeTruthy();
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('javascript');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
        expect(savedTags!.tags[0].relationship).toBe(true);

        // Verify homeserver sync was called
        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should normalize post tag label (trim and lowercase)', async () => {
        await TagController.commitCreate(createTagParams('  JavaScript  ', Core.TagKind.POST));

        const savedTags = await getSavedTags(Core.TagKind.POST);
        expect(savedTags!.tags[0].label).toBe('javascript');

        // Verify homeserver sync was called
        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should rollback post tag when homeserver create fails', async () => {
        vi.spyOn(Core.HomeserverService, 'request').mockRejectedValueOnce(
          new Error('Failed to PUT to homeserver: 403'),
        );

        await expect(TagController.commitCreate(createTagParams('javascript', Core.TagKind.POST))).rejects.toThrow(
          'Failed to PUT to homeserver: 403',
        );

        const savedTags = await getSavedTags(Core.TagKind.POST);
        expect(savedTags?.tags ?? []).toHaveLength(0);
      });
    });

    describe('USER tags', () => {
      it('should save user tag and sync to homeserver', async () => {
        await TagController.commitCreate(createTagParams('developer', Core.TagKind.USER));

        const savedTags = await getSavedTags(Core.TagKind.USER);
        expect(savedTags).toBeTruthy();
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('developer');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
        expect(savedTags!.tags[0].relationship).toBe(true);

        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should normalize user tag label (trim and lowercase)', async () => {
        await TagController.commitCreate(createTagParams('  Developer  ', Core.TagKind.USER));

        const savedTags = await getSavedTags(Core.TagKind.USER);
        expect(savedTags!.tags[0].label).toBe('developer');

        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: expect.stringContaining('pubky://'),
          bodyJson: expect.any(Object),
        });
      });

      it('should rollback user tag when homeserver create fails', async () => {
        vi.spyOn(Core.HomeserverService, 'request').mockRejectedValueOnce(
          new Error('Failed to PUT to homeserver: 403'),
        );

        await expect(TagController.commitCreate(createTagParams('developer', Core.TagKind.USER))).rejects.toThrow(
          'Failed to PUT to homeserver: 403',
        );

        const savedTags = await getSavedTags(Core.TagKind.USER);
        expect(savedTags?.tags ?? []).toHaveLength(0);
      });
    });
  });

  describe('commitDelete', () => {
    describe('POST tags', () => {
      beforeEach(async () => {
        await setupExistingTag('javascript', Core.TagKind.POST);
      });

      it('should remove post tag and sync to homeserver', async () => {
        await TagController.commitDelete(createTagParams('javascript', Core.TagKind.POST));

        const savedTags = await getSavedTags(Core.TagKind.POST);
        expect(savedTags!.tags).toHaveLength(0);

        // Verify homeserver sync was called
        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should normalize post tag label (trim and lowercase)', async () => {
        await TagController.commitDelete(createTagParams('  JavaScript  ', Core.TagKind.POST));

        const savedTags = await getSavedTags(Core.TagKind.POST);
        expect(savedTags!.tags).toHaveLength(0);

        // Verify homeserver sync was called
        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should rollback post tag when homeserver delete fails', async () => {
        vi.spyOn(Core.HomeserverService, 'request').mockRejectedValueOnce(
          new Error('Failed to DELETE from homeserver: 403'),
        );

        await expect(TagController.commitDelete(createTagParams('javascript', Core.TagKind.POST))).rejects.toThrow(
          'Failed to DELETE from homeserver: 403',
        );

        const savedTags = await getSavedTags(Core.TagKind.POST);
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('javascript');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
      });
    });

    describe('USER tags', () => {
      beforeEach(async () => {
        await setupExistingTag('developer', Core.TagKind.USER);
      });

      it('should remove user tag and sync to homeserver', async () => {
        await TagController.commitDelete(createTagParams('developer', Core.TagKind.USER));

        const savedTags = await getSavedTags(Core.TagKind.USER);
        expect(savedTags!.tags).toHaveLength(0);

        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should normalize user tag label (trim and lowercase)', async () => {
        await TagController.commitDelete(createTagParams('  Developer  ', Core.TagKind.USER));

        const savedTags = await getSavedTags(Core.TagKind.USER);
        expect(savedTags!.tags).toHaveLength(0);

        expect(Core.HomeserverService.request).toHaveBeenCalledWith({
          method: HttpMethod.DELETE,
          url: expect.stringContaining('pubky://'),
        });
      });

      it('should rollback user tag when homeserver delete fails', async () => {
        vi.spyOn(Core.HomeserverService, 'request').mockRejectedValueOnce(
          new Error('Failed to DELETE from homeserver: 403'),
        );

        await expect(TagController.commitDelete(createTagParams('developer', Core.TagKind.USER))).rejects.toThrow(
          'Failed to DELETE from homeserver: 403',
        );

        const savedTags = await getSavedTags(Core.TagKind.USER);
        expect(savedTags!.tags).toHaveLength(1);
        expect(savedTags!.tags[0].label).toBe('developer');
        expect(savedTags!.tags[0].taggers_count).toBe(1);
      });
    });
  });
});
