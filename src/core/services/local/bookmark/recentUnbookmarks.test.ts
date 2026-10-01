import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKMARK_REMOVAL_PROTECTION_MS } from '@/config/bookmarks';
import { RecentUnbookmarks } from './recentUnbookmarks';

const viewer = 'viewer-a';
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
    expect(registry.isProtected(viewer, postId)).toBe(false);
  });

  it('protects a removed bookmark within the protection window', () => {
    registry.markRemoved(viewer, postId);
    vi.advanceTimersByTime(BOOKMARK_REMOVAL_PROTECTION_MS - 1);

    expect(registry.isProtected(viewer, postId)).toBe(true);
    expect(registry.isProtected(viewer, 'author:other')).toBe(false);
  });

  it('only protects the viewer who removed the bookmark', () => {
    registry.markRemoved(viewer, postId);

    expect(registry.isProtected('viewer-b', postId)).toBe(false);
  });

  it('protects nothing for a viewerless response', () => {
    registry.markRemoved(viewer, postId);

    expect(registry.isProtected(null, postId)).toBe(false);
    expect(registry.isProtected(undefined, postId)).toBe(false);
  });

  it('stops protecting once the window has passed', () => {
    registry.markRemoved(viewer, postId);
    vi.advanceTimersByTime(BOOKMARK_REMOVAL_PROTECTION_MS);

    expect(registry.isProtected(viewer, postId)).toBe(false);
  });

  it('drops expired removals when a new one is marked', () => {
    registry.markRemoved(viewer, postId);
    vi.advanceTimersByTime(BOOKMARK_REMOVAL_PROTECTION_MS);
    registry.markRemoved(viewer, 'author:other');

    expect(registry['removedAt'].size).toBe(1);
  });

  it('stops protecting when the removal is cleared', () => {
    registry.markRemoved(viewer, postId);
    registry.clear(viewer, postId);

    expect(registry.isProtected(viewer, postId)).toBe(false);
  });
});
