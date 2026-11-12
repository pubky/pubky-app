import { beforeEach, describe, expect, it } from 'vitest';
import { useCustomResourceFeedStore } from './customResourceFeed.store';

describe('useCustomResourceFeedStore', () => {
  beforeEach(() => {
    useCustomResourceFeedStore.getState().reset();
  });

  it('starts with no feed written or ready', () => {
    expect(useCustomResourceFeedStore.getState()).toMatchObject({ readyFeedId: null, pending: null, savedParams: [] });
  });

  it('keeps the parameters the open feed saved from write and ready, and reset forgets them', () => {
    const { write, ready, reset } = useCustomResourceFeedStore.getState();
    write('feed-1', 'kind=event&when=week', ['kind', 'when']);
    expect(useCustomResourceFeedStore.getState().savedParams).toEqual(['kind', 'when']);
    ready('feed-1', ['kind', 'when']);
    expect(useCustomResourceFeedStore.getState().savedParams).toEqual(['kind', 'when']);
    // Another feed with nothing saved
    ready('feed-2');
    expect(useCustomResourceFeedStore.getState().savedParams).toEqual([]);

    write('feed-1', 'kind=event', ['kind']);
    reset();
    expect(useCustomResourceFeedStore.getState().savedParams).toEqual([]);
  });

  it('holds a written feed as pending, not ready, until it is ready', () => {
    const { write, ready } = useCustomResourceFeedStore.getState();
    write('feed-1', 'when=week');
    expect(useCustomResourceFeedStore.getState()).toMatchObject({
      readyFeedId: null,
      pending: { feedId: 'feed-1', search: 'when=week' },
    });

    ready('feed-1');
    expect(useCustomResourceFeedStore.getState()).toMatchObject({ readyFeedId: 'feed-1', pending: null });
  });

  it('writing another feed takes the ready one back, and reset forgets both', () => {
    const { write, ready, reset } = useCustomResourceFeedStore.getState();
    ready('feed-1');
    write('feed-2', 'near=47.37%2C8.54');
    expect(useCustomResourceFeedStore.getState().readyFeedId).toBeNull();

    reset();
    expect(useCustomResourceFeedStore.getState()).toMatchObject({ readyFeedId: null, pending: null });
  });
});
