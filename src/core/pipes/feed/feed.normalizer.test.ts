import { decodeObject, feedId, feedPaths } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { FeedNormalizer } from '@/pipes/feed/feed.normalizer';
import { asOpaque } from '@/test-utils/type-assertions';

describe('FeedNormalizer', () => {
  const userId = fakeOwner(1) as Pubky;

  const createValidParams = (overrides: Partial<TFeedCreateParams> = {}): TFeedCreateParams => ({
    name: 'Bitcoin News',
    icon: 'activity',
    tags: ['bitcoin', 'lightning'],
    domain_tags: [],
    reach: 'all',
    sort: 'recent',
    content: null,
    layout: 'columns',
    ...overrides,
  });

  describe('to', () => {
    it('builds a private feed whose id is the hash of its filter', () => {
      const result = FeedNormalizer.to({ params: createValidParams(), userId });

      expect(result.path).toBe(feedPaths(result.id).private);
      expect(result.path).toBe(`/priv/social/v1/feeds/${result.id}.json`);
      expect(result.url).toBe(`pubky://${userId}${result.path}`);
      expect(feedId(result.object)).toBe(result.id);
      expect(decodeObject(result.url, result.body, 'feed')).toEqual(result.object);
      expect(result.object).toMatchObject({
        name: 'Bitcoin News',
        icon: 'activity',
        feed: { tags: ['bitcoin', 'lightning'], domain_tags: null, reach: 'all', sort: 'recent', layout: 'columns' },
      });
      expect(result.object.feed.content).toBeNull();
    });

    it('lowercases, trims, dedupes and sorts tags, and leaves an empty list out', () => {
      const params = createValidParams({ tags: [' Lightning ', 'BITCOIN', 'bitcoin', '  '] });

      const result = FeedNormalizer.to({ params, userId });

      expect(result.object.feed.tags).toEqual(['bitcoin', 'lightning']);
      expect(result.object.feed.domain_tags).toBeNull();
    });

    it('normalizes profile tags independently and stores them as domain_tags', () => {
      const params = createValidParams({ tags: [], domain_tags: ['🔥', '  BITCOINER ', 'bitcoiner'], reach: 'wot' });

      const result = FeedNormalizer.to({ params, userId });

      expect(result.object.feed.tags).toBeNull();
      expect(result.object.feed.domain_tags).toEqual(['bitcoiner', '🔥']);
    });

    it('trims the name and stores the chosen kinds as the data model spells them', () => {
      const params = createValidParams({
        name: '  Bitcoin News  ',
        sort: 'popularity',
        layout: 'cards',
        content: 'note',
      });

      const result = FeedNormalizer.to({ params, userId });

      expect(result.object.name).toBe('Bitcoin News');
      expect(result.object.feed).toMatchObject({ sort: 'popularity', layout: 'cards', content: 'note' });
    });

    it('crosses a 0.x content kind to the stored vocabulary once', () => {
      // The form never produces these, but a caller holding a stream kind must not store a 0.x name.
      const short = FeedNormalizer.to({ params: createValidParams({ content: asOpaque('short') }), userId });
      const long = FeedNormalizer.to({ params: createValidParams({ content: asOpaque('long') }), userId });

      expect(short.object.feed.content).toBe('note');
      expect(short.id).toBe(FeedNormalizer.to({ params: createValidParams({ content: 'note' }), userId }).id);
      expect(long.object.feed.content).toBe('article');
      expect(() => FeedNormalizer.to({ params: createValidParams({ content: asOpaque('unknown') }), userId })).toThrow(
        'Unsupported feed content kind: unknown',
      );
    });

    it('keeps the id across a rename or a new icon', () => {
      const created = FeedNormalizer.to({ params: createValidParams(), userId });
      const renamed = FeedNormalizer.to({ params: createValidParams({ name: 'Renamed', icon: 'rss' }), userId });

      expect(renamed.id).toBe(created.id);
    });

    it('moves the id when any filter member changes', () => {
      const created = FeedNormalizer.to({ params: createValidParams(), userId });

      for (const change of [
        { sort: 'popularity' },
        { layout: 'wide' },
        { reach: 'following' },
        { content: 'image' },
        { tags: ['bitcoin'] },
        { tags: [], domain_tags: ['bitcoiner'], reach: 'wot' },
      ] satisfies Partial<TFeedCreateParams>[]) {
        expect(FeedNormalizer.to({ params: createValidParams(change), userId }).id).not.toBe(created.id);
      }
    });

    it('accepts emoji profile tags and refuses invalid labels', () => {
      const params = createValidParams({ tags: [], domain_tags: ['🔥'], reach: 'wot' });

      expect(FeedNormalizer.to({ params, userId }).object.feed.domain_tags).toEqual(['🔥']);
      expect(() => FeedNormalizer.to({ params: { ...params, domain_tags: ['bad,tag'] }, userId })).toThrow(AppError);
      expect(() => FeedNormalizer.to({ params: { ...params, domain_tags: ['bad:tag'] }, userId })).toThrow(AppError);
    });

    it('coerces a malformed icon to the default and keeps foreign valid names', () => {
      expect(FeedNormalizer.to({ params: createValidParams({ icon: 'Not A Valid Icon!' }), userId }).object.icon).toBe(
        'activity',
      );
      expect(
        FeedNormalizer.to({ params: createValidParams({ icon: 'another-clients-icon' }), userId }).object.icon,
      ).toBe('another-clients-icon');
    });

    it('throws a validation AppError carrying the package refusal', () => {
      const params = createValidParams({ name: '   ' });

      try {
        FeedNormalizer.to({ params, userId });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.category).toBe(ErrorCategory.Validation);
        expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
        expect(appError.service).toBe(ErrorService.SocialSpecs);
        expect(appError.operation).toBe('buildFeed');
        expect(appError.context).toEqual({ params, userId });
        expect(appError.message).toMatch(/name/i);
        expect(appError.cause).toBeInstanceOf(Error);
      }
    });
  });
});
