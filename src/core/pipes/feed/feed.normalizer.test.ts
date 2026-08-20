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
      (input: {
        tags?: string[];
        reach: string;
        layout: string;
        sort: string;
        content?: string;
        name: string;
        domainTags?: string[];
        icon: string;
      }) => {
        const mockFeed = {
          name: input.name,
          icon: input.icon,
          feed: {
            tags: input.tags,
            domain_tags: input.domainTags,
            reach: PubkyAppFeedReach.All,
            layout: 0,
            sort: PubkyAppFeedSort.Recent,
            content: input.content ? PubkyAppPostKind.Short : null,
          },
          toJson: vi.fn(() => input),
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
      icon: 'activity',
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

      expect(mockBuilder.createFeed).toHaveBeenCalledWith({
        tags: ['bitcoin', 'lightning'],
        reach: 'all',
        layout: 'columns',
        sort: 'recent',
        content: undefined,
        name: testData.feedName,
        domainTags: undefined,
        icon: 'activity',
      });
      expect(result).toBeTruthy();
    });

    it('should normalize tags to lowercase', () => {
      const params = createValidParams();
      params.tags = ['BITCOIN', 'Lightning', 'TECH'];

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['bitcoin', 'lightning', 'tech'] }),
      );
    });

    it('should trim whitespace from tags', () => {
      const params = createValidParams();
      params.tags = ['  bitcoin  ', ' lightning '];

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ tags: ['bitcoin', 'lightning'] }));
    });

    it('should deduplicate tags', () => {
      const params = createValidParams();
      params.tags = ['bitcoin', 'BITCOIN', 'Bitcoin'];

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ tags: ['bitcoin'] }));
    });

    it('should trim feed name', () => {
      const params = createValidParams();
      params.name = '  Bitcoin News  ';

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bitcoin News' }));
    });

    it('coerces a malformed icon to the default and keeps foreign valid names', () => {
      FeedNormalizer.to({ params: { ...createValidParams(), icon: 'Not A Valid Icon!' }, userId: testData.userPubky });
      expect(mockBuilder.createFeed).toHaveBeenLastCalledWith(expect.objectContaining({ icon: 'activity' }));

      FeedNormalizer.to({
        params: { ...createValidParams(), icon: 'another-clients-icon' },
        userId: testData.userPubky,
      });
      expect(mockBuilder.createFeed).toHaveBeenLastCalledWith(
        expect.objectContaining({ icon: 'another-clients-icon' }),
      );
    });

    it('should convert reach enum to string', () => {
      const params = createValidParams();
      params.reach = PubkyAppFeedReach.Following;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ reach: 'following' }));
    });

    it('should convert sort enum to string', () => {
      const params = createValidParams();
      params.sort = PubkyAppFeedSort.Popularity;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ sort: 'popularity' }));
    });

    it('should convert content enum to string when specified', () => {
      const params = createValidParams();
      params.content = PubkyAppPostKind.Image;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ content: 'image' }));
    });

    it('should pass null content when All is selected', () => {
      const params = createValidParams();
      params.content = null;

      FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(expect.objectContaining({ content: undefined }));
    });

    describe('tag normalization', () => {
      it('should normalize empty tags array to empty array', () => {
        const params = createValidParams();
        params.tags = [];

        const result = FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: [],
            reach: 'all',
            layout: 'columns',
            sort: 'recent',
            content: undefined,
            name: testData.feedName,
          }),
        );
        expect(result).toBeTruthy();
      });

      it('should normalize tags with whitespace', () => {
        const params = createValidParams();
        params.tags = ['  BITCOIN  ', '  Lightning  ', 'TECH'];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['bitcoin', 'lightning', 'tech'] }),
        );
      });

      it('should deduplicate tags', () => {
        const params = createValidParams();
        params.tags = ['bitcoin', 'Bitcoin', 'BITCOIN', 'lightning'];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['bitcoin', 'lightning'] }),
        );
      });

      it('should filter out empty tags after trimming', () => {
        const params = createValidParams();
        params.tags = ['bitcoin', '   ', 'lightning', ''];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['bitcoin', 'lightning'] }),
        );
      });

      it('normalizes profile tags independently and forwards them as domain_tags', () => {
        const params = createValidParams();
        params.domain_tags = ['🔥', '  BITCOINER ', 'bitcoiner'];

        FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith({
          tags: ['bitcoin', 'lightning'],
          reach: 'all',
          layout: 'columns',
          sort: 'recent',
          content: undefined,
          name: testData.feedName,
          domainTags: ['bitcoiner', '🔥'],
          icon: 'activity',
        });
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
        const legacy = builder.createFeed({
          tags: params.tags,
          reach: 'all',
          layout: 'columns',
          sort: 'recent',
          name: params.name,
          icon: params.icon,
        });

        const normalized = FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(normalized.meta.id).toBe(legacy.meta.id);
        expect(normalized.feed.toJson().feed).not.toHaveProperty('domain_tags');
      });

      it('converges a foreign absent-tags feed once on its first edit', () => {
        const builder = new PubkySpecsBuilder(testData.userPubky);
        vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(builder);
        const foreign = builder.createFeed({
          reach: 'wot',
          layout: 'columns',
          sort: 'recent',
          name: 'Foreign Feed',
          domainTags: ['bitcoiner'],
          icon: 'activity',
        });
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
