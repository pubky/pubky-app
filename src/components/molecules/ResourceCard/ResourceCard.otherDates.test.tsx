import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import type { UseEventDatesResult } from '@/hooks/useEventDates/useEventDates';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import meetupCollapsedFixture from '@/services/pinakes/fixtures/search.meetup-collapsed.json';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceCard } from './ResourceCard';

const mocks = vi.hoisted(() => ({ dates: null as unknown, asked: [] as unknown[][] }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
vi.mock('@/hooks/useEventDates/useEventDates', () => ({
  useEventDates: (...args: unknown[]) => {
    mocks.asked.push(args);
    return mocks.dates;
  },
}));

const DATE: TPinakesResourceDetail = meetupDateFixture;
const DATES: TPinakesCard[] = meetupDatesFixture.items;
const OTHER_DATES = DATES.filter((card) => card.start !== DATE.start);

const dates = (overrides: Partial<UseEventDatesResult> = {}): UseEventDatesResult => ({
  feed: {
    id: '51ee469240e25fe6a378dc8d317e3f89',
    uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/ical/',
  },
  sameName: OTHER_DATES.slice(1),
  others: [],
  isLoading: false,
  isError: false,
  hasMore: false,
  isLoadingMore: false,
  isMoreError: false,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});

describe('ResourceCard other dates', () => {
  beforeEach(() => {
    mocks.dates = dates();
    mocks.asked.length = 0;
  });

  it('says how many other dates the series has and the next one, linking the page’s Other dates', () => {
    render(<ResourceCard card={DATE} href={DATE.uri} />);

    const line = screen.getByTestId('resource-card-other-dates');
    // Nov 25 has passed by then: the next is the first the feed lists
    expect(line).toHaveTextContent('Other dates · 8 · next Wed, Dec 23');
    // The count never wraps alone onto a line of its own
    expect(screen.getByRole('link', { name: 'Other dates\u00a0·\u00a08 · next Wed, Dec 23' })).toHaveAttribute(
      'href',
      `${getResourceRoute(DATE.uri)}#other-dates`,
    );
  });

  it('names as next the first other date after the card’s own, not an earlier one still to come', () => {
    // Nov 25 is the series' soonest date, but before this Dec 9 card
    mocks.dates = dates({ sameName: OTHER_DATES });
    render(<ResourceCard card={DATE} href={DATE.uri} />);

    expect(screen.getByTestId('resource-card-other-dates')).toHaveTextContent('Other dates · 9 · next Wed, Dec 23');
  });

  it('counts the other dates alone when none comes after the card’s own', () => {
    mocks.dates = dates({ sameName: OTHER_DATES.filter((card) => card.start! < DATE.start!) });
    render(<ResourceCard card={DATE} href={DATE.uri} />);

    const line = screen.getByTestId('resource-card-other-dates');
    expect(line.textContent?.replace(/\s/g, ' ')).toBe('Other dates · 1');
  });

  it('does the same on an agenda or map row (a feed’s date, `ResourceInstanceCard`’s card)', () => {
    const [nov25, , dec23]: TPinakesCard[] = meetupCollapsedFixture.items;
    const others = DATES.filter((card) => card.start !== dec23.start);
    mocks.dates = dates({ sameName: others });
    const { unmount } = render(<ResourceCard card={dec23} href={dec23.uri} />);
    expect(screen.getByTestId('resource-card-other-dates')).toHaveTextContent('Other dates · 9 · next Wed, Jan 6');
    unmount();

    mocks.dates = dates({ sameName: [nov25] });
    render(<ResourceCard card={dec23} href={dec23.uri} />);
    expect(screen.getByTestId('resource-card-other-dates').textContent?.replace(/\s/g, ' ')).toBe('Other dates · 1');
  });

  it('reads the dates only once the card has been on screen', () => {
    const { rerender } = render(<ResourceCard card={DATE} href={DATE.uri} isOnScreen={false} />);
    expect(mocks.asked.at(-1)).toEqual([DATE, { enabled: false }]);

    rerender(<ResourceCard card={DATE} href={DATE.uri} isOnScreen />);
    expect(mocks.asked.at(-1)).toEqual([DATE, { enabled: true }]);
  });

  it('shows no line while read, when it failed, for a series with no other date or an event with no feed', () => {
    for (const read of [
      dates({ sameName: [], isLoading: true }),
      dates({ sameName: [], isError: true }),
      dates({ sameName: [] }),
      dates({ feed: null, sameName: [] }),
    ]) {
      mocks.dates = read;
      const { unmount } = render(<ResourceCard card={DATE} href={DATE.uri} />);
      expect(screen.queryByTestId('resource-card-other-dates')).toBeNull();
      unmount();
    }
  });

  it('counts “N+” when the feed has more dates than one read, and asks nothing for a card that is no event', () => {
    mocks.dates = dates({ hasMore: true });
    const { unmount } = render(<ResourceCard card={DATE} href={DATE.uri} />);
    expect(screen.getByTestId('resource-card-other-dates')).toHaveTextContent('Other dates · 8+ ·');
    unmount();

    const video: TPinakesResourceDetail = videoFixture;
    render(<ResourceCard card={video} href={video.uri} />);
    expect(mocks.asked.at(-1)?.[1]).toEqual({ enabled: false });
    expect(screen.queryByTestId('resource-card-other-dates')).toBeNull();
  });

  it('leaves the line to the large card’s page, which lists the dates', () => {
    render(<ResourceCard card={DATE} href={DATE.uri} size="large" />);

    expect(mocks.asked.at(-1)?.[1]).toEqual({ enabled: false });
    expect(screen.queryByTestId('resource-card-other-dates')).toBeNull();
  });
});
