import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MuteFilter } from './mute-filter';
import type { Pubky } from '@/core';

// Mock the parseCompositeId function
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    parseCompositeId: vi.fn((id: string) => {
      // Simulate parsing: "author:postId" format
      if (id.includes(':')) {
        const [pubky, postId] = id.split(':');
        return { pubky, postId };
      }
      throw new Error('Invalid composite ID format');
    }),
  };
});

// Mock the Logger to prevent console output during tests
vi.mock('@/libs/logger/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/logger/logger')>();
  return {
    ...actual,
    Logger: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('MuteFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('filterPosts', () => {
    it('returns all posts when no users are muted', () => {
      const postIds = ['user1:post1', 'user2:post2', 'user3:post3'];
      const mutedUserIds = new Set<Pubky>();

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual(postIds);
    });

    it('filters out posts from muted users', () => {
      const postIds = ['user1:post1', 'muted:post2', 'user3:post3'];
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual(['user1:post1', 'user3:post3']);
    });

    it('filters out multiple muted users', () => {
      const postIds = ['user1:post1', 'muted1:post2', 'muted2:post3', 'user2:post4'];
      const mutedUserIds = new Set<Pubky>(['muted1' as Pubky, 'muted2' as Pubky]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual(['user1:post1', 'user2:post4']);
    });

    it('returns empty array when all users are muted', () => {
      const postIds = ['muted1:post1', 'muted2:post2'];
      const mutedUserIds = new Set<Pubky>(['muted1' as Pubky, 'muted2' as Pubky]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual([]);
    });

    it('handles empty post array', () => {
      const postIds: string[] = [];
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual([]);
    });

    it('throws error when encountering invalid ID format', () => {
      const postIds = ['user1:post1', 'invalid-no-colon', 'user2:post2'];
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      // filterPosts does not catch parse errors - it throws
      // Use filterPostsSafe for safe handling of invalid IDs
      expect(() => MuteFilter.filterPosts(postIds, mutedUserIds)).toThrow();
    });
  });

  describe('filterPostsSafe', () => {
    it('returns all posts when no users are muted', () => {
      const postIds = ['user1:post1', 'user2:post2'];
      const mutedUserIds = new Set<Pubky>();

      const result = MuteFilter.filterPostsSafe(postIds, mutedUserIds);

      expect(result).toEqual(postIds);
    });

    it('filters out posts from muted users', () => {
      const postIds = ['user1:post1', 'muted:post2', 'user3:post3'];
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.filterPostsSafe(postIds, mutedUserIds);

      expect(result).toEqual(['user1:post1', 'user3:post3']);
    });

    it('includes posts with invalid IDs (fail-open behavior)', () => {
      const postIds = ['user1:post1', 'invalid-no-colon', 'user2:post2'];
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.filterPostsSafe(postIds, mutedUserIds);

      // Invalid ID should be included (fail-open) to avoid hiding valid content
      // The implementation logs a debug message for failed parses
      expect(result).toEqual(['user1:post1', 'invalid-no-colon', 'user2:post2']);
    });
  });

  describe('isPostMuted', () => {
    it('returns false when no users are muted', () => {
      const mutedUserIds = new Set<Pubky>();

      const result = MuteFilter.isPostMuted('user1:post1', mutedUserIds);

      expect(result).toBe(false);
    });

    it('returns true when post author is muted', () => {
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.isPostMuted('muted:post1', mutedUserIds);

      expect(result).toBe(true);
    });

    it('returns false when post author is not muted', () => {
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.isPostMuted('user1:post1', mutedUserIds);

      expect(result).toBe(false);
    });

    it('returns false for invalid post ID (fail-open behavior)', () => {
      const mutedUserIds = new Set<Pubky>(['muted' as Pubky]);

      const result = MuteFilter.isPostMuted('invalid-no-colon', mutedUserIds);

      // Invalid ID should return false (not muted) to avoid hiding valid content
      // The implementation logs a debug message for failed parses
      expect(result).toBe(false);
    });
  });
});
