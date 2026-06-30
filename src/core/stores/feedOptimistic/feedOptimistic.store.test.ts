import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedOptimisticStore } from './feedOptimistic.store';
import { buildFeedKey } from './feedOptimistic.types';

describe('buildFeedKey', () => {
  it('returns a stable key for the bookmarks feed', () => {
    expect(buildFeedKey({ type: 'bookmarks' })).toBe('bookmarks');
  });

  it('namespaces the collection key by composite id', () => {
    expect(buildFeedKey({ type: 'collection', collectionId: 'author:post1' })).toBe('collection:author:post1');
  });
});

describe('useFeedOptimisticStore', () => {
  beforeEach(() => {
    useFeedOptimisticStore.setState({ pendingByKey: {} });
  });

  it('enqueues a post id under the given key', () => {
    useFeedOptimisticStore.getState().enqueue('bookmarks', 'a:1');
    expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toEqual(['a:1']);
  });

  it('prepends newer ids and ignores duplicates', () => {
    const { enqueue } = useFeedOptimisticStore.getState();
    enqueue('collection:c', 'a:1');
    enqueue('collection:c', 'a:2');
    enqueue('collection:c', 'a:1');
    expect(useFeedOptimisticStore.getState().pendingByKey['collection:c']).toEqual(['a:2', 'a:1']);
  });

  it('keeps separate queues per key', () => {
    const { enqueue } = useFeedOptimisticStore.getState();
    enqueue('bookmarks', 'a:1');
    enqueue('collection:c', 'a:2');
    expect(useFeedOptimisticStore.getState().pendingByKey).toEqual({ bookmarks: ['a:1'], 'collection:c': ['a:2'] });
  });

  it('clears a key and is a no-op for unknown keys', () => {
    const { enqueue, clear } = useFeedOptimisticStore.getState();
    enqueue('bookmarks', 'a:1');
    clear('bookmarks');
    expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toBeUndefined();
    expect(() => clear('does-not-exist')).not.toThrow();
  });
});
