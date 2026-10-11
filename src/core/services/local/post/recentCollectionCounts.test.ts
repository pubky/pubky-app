import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_COUNT_PROTECTION_MS } from '@/config/collections';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { RecentCollectionWrites } from './recentCollectionCounts';

const postId = 'author:post';

describe('RecentCollectionWrites', () => {
  let registry: RecentCollectionWrites;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new RecentCollectionWrites();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('protects nothing until a write is marked', () => {
    expect(registry.isProtected(postId)).toBe(false);
  });

  it('protects a marked post within the protection window', () => {
    registry.markWritten(postId);
    vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS - 1);

    expect(registry.isProtected(postId)).toBe(true);
    expect(registry.isProtected('author:other')).toBe(false);
  });

  it('stops protecting once the window has passed', () => {
    registry.markWritten(postId);
    vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS);

    expect(registry.isProtected(postId)).toBe(false);
  });

  it('restarts the window on every write', () => {
    registry.markWritten(postId);
    vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS - 1);
    registry.markWritten(postId);
    vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS - 1);

    expect(registry.isProtected(postId)).toBe(true);
  });

  it('drops expired writes when a new one is marked', () => {
    registry.markWritten(postId);
    vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS);
    registry.markWritten('author:other');

    expect(registry['writes'].size).toBe(1);
  });

  it('stops protecting once the local cache was cleared', async () => {
    // Sign-in and sign-out clear the rows a mark stood for; the first response of the next
    // session is the only copy of the count and must land.
    vi.useRealTimers();
    registry.markWritten(postId);

    await clearDatabase();

    expect(registry.isProtected(postId)).toBe(false);
  });

  it('restores what a mark replaced when its write is rolled back', () => {
    registry.markWritten(postId);
    vi.advanceTimersByTime(1_000);
    const previous = registry.markWritten(postId);
    expect(previous).toBeDefined();

    // The second write did not commit: the first one's mark (and its older clock) stands.
    registry.restore(postId, previous);
    vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS - 1_000);
    expect(registry.isProtected(postId)).toBe(false);

    // No earlier mark: the failed write leaves nothing behind.
    const none = registry.markWritten('author:other');
    expect(none).toBeUndefined();
    registry.restore('author:other', none);
    expect(registry.isProtected('author:other')).toBe(false);
  });

  it('stops protecting when the mark is cleared', () => {
    registry.markWritten(postId);
    registry.clear(postId);

    expect(registry.isProtected(postId)).toBe(false);
  });

  it('forgets everything on reset', () => {
    registry.markWritten(postId);
    registry.reset();

    expect(registry.isProtected(postId)).toBe(false);
  });
});
