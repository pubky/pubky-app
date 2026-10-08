import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_COUNT_PROTECTION_MS } from '@/config/collections';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { RecentCollectionCounts } from './recentCollectionCounts';

const postId = 'author:post';

describe('RecentCollectionCounts', () => {
  let registry: RecentCollectionCounts;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new RecentCollectionCounts();
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
