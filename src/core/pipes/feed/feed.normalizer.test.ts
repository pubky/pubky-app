import {
  FeedResult,
  PubkyAppFeedLayout,
  PubkyAppFeedReach,
  PubkyAppFeedSort,
  PubkyAppPostKind,
  PubkySpecsBuilder,
} from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { FeedNormalizer } from '@/pipes/feed/feed.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { asOpaque } from '@/test-utils/type-assertions';

describe('FeedNormalizer', () => {
  const testData = {
    userPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
    feedName: 'Bitcoin News',
    tags: ['bitcoin', 'lightning'],
  };

  // Mock builder factory
  const createMockBuilder = () => ({
    createFeed: vi.fn(
      (
        tags: string[],
        reach: string,
        layout: string,
        sort: string,
        content: string | null,
        name: string,
        domainTags?: string[],
      ) => {
        const mockFeed = {
          name,
          feed: {
            tags,
            domain_tags: domainTags,
            reach: PubkyAppFeedReach.All,
            layout: 0,
            sort: PubkyAppFeedSort.Recent,
            content: content ? PubkyAppPostKind.Short : null,
          },
          toJson: vi.fn(() => ({ name, tags, reach, layout, sort, content })),
        };
        return asOpaque<FeedResult>({
          feed: mockFeed,
          meta: {
            id: 'feed123',
            url: `pubky://${testData.userPubky}/pub/pubky.app/feeds/feed123`,
            path: '/pub/pubky.app/feeds/feed123',
          },
        });
      },
    ),
  });

  let mockBuilder: ReturnType<typeof createMockBuilder>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuilder = createMockBuilder();
    vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(asOpaque<PubkySpecsBuilder>(mockBuilder));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('to', () => {
    const createValidParams = (): TFeedCreateParams => ({
      name: testData.feedName,
      tags: testData.tags,
      domain_tags: [],
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Columns,
    });

    it('should create feed using builder with correct parameters', () => {
      const params = createValidParams();

      const result = FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin', 'lightning'],
        'all',
        'columns',
        'recent',
        null,
        testData.feedName,
        undefined,
      );
      expect(result).toBeTruthy();
    });

    it('should normalize tags to lowercase', () => {
      const params = createValidParams();
      params.tags = ['BITCOIN', 'Lightning', 'TECH'];

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin', 'lightning', 'tech'],
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        undefined,
      );
    });

    it('should trim whitespace from tags', () => {
      const params = createValidParams();
      params.tags = ['  bitcoin  ', ' lightning '];

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin', 'lightning'],
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        undefined,
      );
    });

    it('should deduplicate tags', () => {
      const params = createValidParams();
      params.tags = ['bitcoin', 'BITCOIN', 'Bitcoin'];

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin'],
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        undefined,
      );
    });

    it('should trim feed name', () => {
      const params = createValidParams();
      params.name = '  Bitcoin News  ';

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        'Bitcoin News',
        undefined,
      );
    });

    it('should convert reach enum to string', () => {
      const params = createValidParams();
      params.reach = PubkyAppFeedReach.Following;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        'following',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        undefined,
      );
    });

    it('should convert sort enum to string', () => {
      const params = createValidParams();
      params.sort = PubkyAppFeedSort.Popularity;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        'popularity',
        expect.any(Object),
        expect.any(String),
        undefined,
      );
    });

    it('should convert content enum to string when specified', () => {
      const params = createValidParams();
      params.content = PubkyAppPostKind.Image;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        'image',
        expect.any(String),
        undefined,
      );
    });

    it('should pass null content when All is selected', () => {
      const params = createValidParams();
      params.content = null;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        null,
        expect.any(String),
        undefined,
      );
    });

    describe('tag normalization', () => {
      it('should normalize empty tags array to empty array', () => {
        const params = createValidParams();
        params.tags = [];

        const result = FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          [],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
          undefined,
        );
        expect(result).toBeTruthy();
      });

      it('should normalize tags with whitespace', () => {
        const params = createValidParams();
        params.tags = ['  BITCOIN  ', '  Lightning  ', 'TECH'];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning', 'tech'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
          undefined,
        );
      });

      it('should deduplicate tags', () => {
        const params = createValidParams();
        params.tags = ['bitcoin', 'Bitcoin', 'BITCOIN', 'lightning'];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
          undefined,
        );
      });

      it('should filter out empty tags after trimming', () => {
        const params = createValidParams();
        params.tags = ['bitcoin', '   ', 'lightning', ''];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
          undefined,
        );
      });

      it('normalizes profile tags independently and forwards them as domain_tags', () => {
        const params = createValidParams();
        params.domain_tags = ['🔥', '  BITCOINER ', 'bitcoiner'];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
          ['bitcoiner', '🔥'],
        );
      });
    });

    describe('pubky-app-specs integration', () => {
      it('keeps app-created feeds ID-stable across renames', () => {
        const builder = new PubkySpecsBuilder(testData.userPubky);
        vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(builder);
        const params = createValidParams();
        params.reach = PubkyAppFeedReach.Wot;
        params.domain_tags = ['🔥', 'Bitcoiner'];

        const created = FeedNormalizer.to({ params, userId: testData.userPubky });
        const renamed = FeedNormalizer.to({
          params: { ...params, name: 'Renamed Feed' },
          userId: testData.userPubky,
        });

        expect(renamed.meta.id).toBe(created.meta.id);
        expect(created.feed.toJson().feed.domain_tags).toEqual(['bitcoiner', '🔥']);
      });

      it('keeps legacy feed IDs unchanged when domain_tags is absent', () => {
        const builder = new PubkySpecsBuilder(testData.userPubky);
        vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(builder);
        const params = createValidParams();
        const legacy = builder.createFeed(params.tags, 'all', 'columns', 'recent', null, params.name, undefined);

        const normalized = FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(normalized.meta.id).toBe(legacy.meta.id);
        expect(normalized.feed.toJson().feed).not.toHaveProperty('domain_tags');
      });

      it('converges a foreign absent-tags feed once on its first edit', () => {
        const builder = new PubkySpecsBuilder(testData.userPubky);
        vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(builder);
        const foreign = builder.createFeed(undefined, 'wot', 'columns', 'recent', null, 'Foreign Feed', ['bitcoiner']);
        const canonicalParams = createValidParams();
        canonicalParams.tags = [];
        canonicalParams.domain_tags = ['bitcoiner'];
        canonicalParams.reach = PubkyAppFeedReach.Wot;

        const firstEdit = FeedNormalizer.to({ params: canonicalParams, userId: testData.userPubky });
        const secondRename = FeedNormalizer.to({
          params: { ...canonicalParams, name: 'Second Rename' },
          userId: testData.userPubky,
        });

        expect(firstEdit.meta.id).not.toBe(foreign.meta.id);
        expect(secondRename.meta.id).toBe(firstEdit.meta.id);
      });

      it('accepts emoji profile tags and rejects canonical invalid labels', () => {
        const builder = new PubkySpecsBuilder(testData.userPubky);
        vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(builder);
        const params = createValidParams();
        params.tags = [];
        params.domain_tags = ['🔥'];
        params.reach = PubkyAppFeedReach.Wot;

        expect(() => FeedNormalizer.to({ params, userId: testData.userPubky })).not.toThrow();
        expect(() =>
          FeedNormalizer.to({ params: { ...params, domain_tags: ['bad,tag'] }, userId: testData.userPubky }),
        ).toThrow();
        expect(() =>
          FeedNormalizer.to({ params: { ...params, domain_tags: ['bad:tag'] }, userId: testData.userPubky }),
        ).toThrow();
      });
    });

    it('should throw AppError with correct properties when builder fails', () => {
      const params = createValidParams();
      const errorMessage = 'Invalid feed configuration';
      mockBuilder.createFeed.mockImplementation(() => {
        throw errorMessage;
      });

      try {
        FeedNormalizer.to({ params, userId: testData.userPubky });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
        expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
        expect(appError.operation).toBe('createFeed');
        expect(appError.context).toEqual({ params, userId: testData.userPubky });
        expect(appError.message).toBe(errorMessage);
      }
    });
  });
});
