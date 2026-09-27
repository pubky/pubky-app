import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKMARK_REMOVAL_PROTECTION_MS, RecentUnbookmarks } from './recentUnbookmarks';

const postId = 'author:post';

describe('RecentUnbookmarks', () => {
  let registry: RecentUnbookmarks;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new RecentUnbookmarks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('protects nothing until a removal is marked', () => {
    expect(registry.isProtected(postId)).toBe(false);
  });

  it('protects a removed bookmark within the protection window', () => {
    registry.markRemoved(postId);
    vi.advanceTimersByTime(BOOKMARK_REMOVAL_PROTECTION_MS - 1);

    expect(registry.isProtected(postId)).toBe(true);
    expect(registry.isProtected('author:other')).toBe(false);
  });

  it('stops protecting once the window has passed', () => {
    registry.markRemoved(postId);
    vi.advanceTimersByTime(BOOKMARK_REMOVAL_PROTECTION_MS);

    expect(registry.isProtected(postId)).toBe(false);
  });

  it('drops expired removals when a new one is marked', () => {
    registry.markRemoved(postId);
    vi.advanceTimersByTime(BOOKMARK_REMOVAL_PROTECTION_MS);
    registry.markRemoved('author:other');

    expect(registry['removedAt'].has(postId)).toBe(false);
  });

  it('stops protecting when the removal is cleared', () => {
    registry.markRemoved(postId);
    registry.clear(postId);

    expect(registry.isProtected(postId)).toBe(false);
  });
});
