import { decodeObject, feedId } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { FeedNormalizer } from '@/pipes/feed/feed.normalizer';

describe('FeedNormalizer', () => {
  const userId = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

  const createValidParams = (): TFeedCreateParams => ({
    name: 'Bitcoin News',
    icon: 'activity',
    tags: ['bitcoin', 'lightning'],
    domain_tags: [],
    reach: 'all',
    sort: 'recent',
    content: null,
    layout: 'columns',
  });

  describe('to', () => {
    it('builds a private feed whose id is its filter', () => {
      const result = FeedNormalizer.to({ params: createValidParams(), userId });

      expect(result.path).toBe(`/priv/social/v1/feeds/${result.id}.json`);
      expect(feedId(result.object)).toBe(result.id);
      expect(decodeObject(result.url, result.body, 'feed')).toEqual(result.object);
      expect(result.object.feed).toMatchObject({ tags: ['bitcoin', 'lightning'], reach: 'all', content: null });
    });

    it('lowercases, trims and dedupes tags, and leaves an empty list out', () => {
      const params = { ...createValidParams(), tags: [' BITCOIN ', 'Lightning', 'bitcoin', '  '] };
      const result = FeedNormalizer.to({ params, userId });

      expect(result.object.feed.tags).toEqual(['bitcoin', 'lightning']);
      expect(result.object.feed.domain_tags).toBeNull();
    });

    it('keeps the id across a rename or a new icon', () => {
      const created = FeedNormalizer.to({ params: createValidParams(), userId });
      const renamed = FeedNormalizer.to({ params: { ...createValidParams(), name: 'Renamed', icon: 'rss' }, userId });
      expect(renamed.id).toBe(created.id);
    });

    it('moves the id when the filter changes', () => {
      const created = FeedNormalizer.to({ params: createValidParams(), userId });
      const resorted = FeedNormalizer.to({ params: { ...createValidParams(), sort: 'popularity' }, userId });
      expect(resorted.id).not.toBe(created.id);
    });

    it('accepts emoji profile tags and refuses invalid labels', () => {
      const params = { ...createValidParams(), tags: [], domain_tags: ['🔥'], reach: 'wot' as const };

      expect(FeedNormalizer.to({ params, userId }).object.feed.domain_tags).toEqual(['🔥']);
      expect(() => FeedNormalizer.to({ params: { ...params, domain_tags: ['bad,tag'] }, userId })).toThrow(AppError);
      expect(() => FeedNormalizer.to({ params: { ...params, domain_tags: ['bad:tag'] }, userId })).toThrow(AppError);
    });

    it('degrades an icon the data model refuses to the default', () => {
      const result = FeedNormalizer.to({ params: { ...createValidParams(), icon: '-bad icon-' }, userId });
      expect(result.object.icon).not.toBe('-bad icon-');
    });

    it('throws a validation AppError with the package message when the package refuses', () => {
      const params = { ...createValidParams(), name: '   ' };
      try {
        FeedNormalizer.to({ params, userId });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
        expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
        expect(appError.operation).toBe('buildFeed');
        expect(appError.message).toMatch(/^Validation Error: /);
      }
    });
  });
});
