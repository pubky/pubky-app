import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH } from '@/stores/home/home.types';
import { useHomeResourceFeed } from './useHomeResourceFeed';

describe('useHomeResourceFeed', () => {
  afterEach(() => {
    useHomeStore.setState({ reach: REACH.ALL, taggedAsActive: false, profileTags: [] });
  });

  it('is every resource in the Home reach and sort', () => {
    useHomeStore.setState({ reach: REACH.FOLLOWING, sort: 'total_engagement' });

    expect(renderHook(() => useHomeResourceFeed()).result.current).toEqual({
      tags: [],
      reach: REACH.FOLLOWING,
      sort: 'total_engagement',
    });
  });

  it('reads Tagged as over My network as All, which the filter shows', () => {
    useHomeStore.setState({ reach: REACH.NETWORK, taggedAsActive: true, profileTags: ['dev'] });
    expect(renderHook(() => useHomeResourceFeed()).result.current.reach).toBe(REACH.ALL);

    useHomeStore.setState({ taggedAsActive: false });
    expect(renderHook(() => useHomeResourceFeed()).result.current.reach).toBe(REACH.NETWORK);
  });
});
