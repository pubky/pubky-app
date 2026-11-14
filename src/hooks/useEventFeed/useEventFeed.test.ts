import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupGroupFixture from '@/services/pinakes/fixtures/group.meetup-date.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useEventFeed } from './useEventFeed';

const mocks = vi.hoisted(() => ({ configured: true, fetchGroup: vi.fn(), getCachedGroup: vi.fn() }));

vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => mocks.configured,
}));
vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: { fetchGroup: mocks.fetchGroup, getCachedGroup: mocks.getCachedGroup },
}));

const DATE: TPinakesResourceDetail = meetupDateFixture;
const GROUP: TPinakesGroupDetail = meetupGroupFixture;
const [NOV25]: TPinakesCard[] = meetupDatesFixture.items;
const FEED = {
  id: '51ee469240e25fe6a378dc8d317e3f89',
  uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/ical/',
};

describe('useEventFeed', () => {
  beforeEach(() => {
    mocks.configured = true;
    mocks.fetchGroup.mockReset().mockResolvedValue(GROUP);
    mocks.getCachedGroup.mockReset().mockReturnValue(undefined);
  });

  it('finds a date page’s feed in its group, read once by the shared group read', async () => {
    const { result } = renderHook(() => useEventFeed(DATE));

    expect(result.current).toEqual({ feed: null, isLoading: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.feed).toEqual(FEED);
    expect(mocks.fetchGroup).toHaveBeenCalledExactlyOnceWith({ id: GROUP.id });
  });

  it('takes the group another reader already read, without asking Pinakes', async () => {
    mocks.getCachedGroup.mockReturnValue(GROUP);

    const { result } = renderHook(() => useEventFeed(DATE));

    await waitFor(() => expect(result.current.feed).toEqual(FEED));
    expect(mocks.getCachedGroup).toHaveBeenCalledWith({ id: GROUP.id });
    expect(mocks.fetchGroup).not.toHaveBeenCalled();
  });

  it('is none for a group without a feed’s date', async () => {
    mocks.fetchGroup.mockResolvedValue({ ...GROUP, members: GROUP.members.map((m) => ({ ...m, occurrence: null })) });

    const { result } = renderHook(() => useEventFeed(DATE));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.feed).toBeNull();
  });

  it('asks nothing for an event outside a group, a feed’s own date, while disabled or without Pinakes', () => {
    const lone: TPinakesResourceDetail = eventFixture;
    expect(renderHook(() => useEventFeed({ ...lone, group: null })).result.current).toEqual({
      feed: null,
      isLoading: false,
    });
    expect(renderHook(() => useEventFeed(NOV25)).result.current).toEqual({ feed: FEED, isLoading: false });
    expect(renderHook(() => useEventFeed(DATE, { enabled: false })).result.current.isLoading).toBe(false);
    mocks.configured = false;
    expect(renderHook(() => useEventFeed(DATE)).result.current.isLoading).toBe(false);

    expect(mocks.fetchGroup).not.toHaveBeenCalled();
    expect(mocks.getCachedGroup).not.toHaveBeenCalled();
  });
});
