import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PubkyAppFeedLayout,
  PubkyAppFeedReach,
  PubkyAppFeedSort,
  PubkyAppPostKind,
  FeedResult,
  PubkySpecsBuilder,
} from 'pubky-app-specs';
import * as Core from '@/core';
import { asOpaque } from '@/test-utils';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

describe('FeedNormalizer', () => {
  const testData = {
    userPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Core.Pubky,
    feedName: 'Bitcoin News',
    tags: ['bitcoin', 'lightning'],
  };

  // Mock builder factory
  const createMockBuilder = () => ({
    createFeed: vi.fn(
      (tags: string[], reach: string, layout: string, sort: string, content: string | null, name: string) => {
        const mockFeed = {
          name,
          feed: {
            tags,
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
    vi.spyOn(Core.PubkySpecsSingleton, 'get').mockReturnValue(asOpaque<PubkySpecsBuilder>(mockBuilder));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('to', () => {
    const createValidParams = (): Core.TFeedCreateParams => ({
      name: testData.feedName,
      tags: testData.tags,
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Columns,
    });

    it('should create feed using builder with correct parameters', () => {
      const params = createValidParams();

      const result = Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin', 'lightning'],
        'all',
        'columns',
        'recent',
        null,
        testData.feedName,
      );
      expect(result).toBeTruthy();
    });

    it('should normalize tags to lowercase', () => {
      const params = createValidParams();
      params.tags = ['BITCOIN', 'Lightning', 'TECH'];

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin', 'lightning', 'tech'],
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should trim whitespace from tags', () => {
      const params = createValidParams();
      params.tags = ['  bitcoin  ', ' lightning '];

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin', 'lightning'],
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should deduplicate tags', () => {
      const params = createValidParams();
      params.tags = ['bitcoin', 'BITCOIN', 'Bitcoin'];

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin'],
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should trim feed name', () => {
      const params = createValidParams();
      params.name = '  Bitcoin News  ';

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        'Bitcoin News',
      );
    });

    it('should convert reach enum to string', () => {
      const params = createValidParams();
      params.reach = PubkyAppFeedReach.Following;

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        'following',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should convert sort enum to string', () => {
      const params = createValidParams();
      params.sort = PubkyAppFeedSort.Popularity;

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        'popularity',
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should convert content enum to string when specified', () => {
      const params = createValidParams();
      params.content = PubkyAppPostKind.Image;

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        'image',
        expect.any(String),
      );
    });

    it('should pass null content when All is selected', () => {
      const params = createValidParams();
      params.content = null;

      Core.FeedNormalizer.to({ params, userId: testData.userPubky });

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        null,
        expect.any(String),
      );
    });

    describe('tag normalization', () => {
      it('should normalize empty tags array to empty array', () => {
        const params = createValidParams();
        params.tags = [];

        const result = Core.FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith([], 'all', 'columns', 'recent', null, testData.feedName);
        expect(result).toBeTruthy();
      });

      it('should normalize tags with whitespace', () => {
        const params = createValidParams();
        params.tags = ['  BITCOIN  ', '  Lightning  ', 'TECH'];

        Core.FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning', 'tech'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
        );
      });

      it('should deduplicate tags', () => {
        const params = createValidParams();
        params.tags = ['bitcoin', 'Bitcoin', 'BITCOIN', 'lightning'];

        Core.FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
        );
      });

      it('should filter out empty tags after trimming', () => {
        const params = createValidParams();
        params.tags = ['bitcoin', '   ', 'lightning', ''];

        Core.FeedNormalizer.to({ params, userId: testData.userPubky });

        expect(mockBuilder.createFeed).toHaveBeenCalledWith(
          ['bitcoin', 'lightning'],
          'all',
          'columns',
          'recent',
          null,
          testData.feedName,
        );
      });
    });

    it('should throw AppError with correct properties when builder fails', () => {
      const params = createValidParams();
      const errorMessage = 'Invalid feed configuration';
      mockBuilder.createFeed.mockImplementation(() => {
        throw errorMessage;
      });

      try {
        Core.FeedNormalizer.to({ params, userId: testData.userPubky });
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
