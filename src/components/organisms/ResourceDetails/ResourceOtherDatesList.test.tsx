import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import type { UseEventDatesResult } from '@/hooks/useEventDates/useEventDates';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupFeedFixture from '@/services/pinakes/fixtures/by-uri.meetup-feed.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { ResourceOtherDatesList } from './ResourceOtherDatesList';

const mocks = vi.hoisted(() => ({
  dates: null as unknown,
  asked: [] as unknown[][],
  feedCard: { data: null as unknown, isLoading: false, isError: false },
  feedAsked: [] as unknown[],
}));

vi.mock('@/hooks/useEventDates/useEventDates', () => ({
  useEventDates: (...args: unknown[]) => {
    mocks.asked.push(args);
    return mocks.dates;
  },
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({
  usePinakesCard: (uri: unknown) => {
    mocks.feedAsked.push(uri);
    return mocks.feedCard;
  },
}));
// The rows' Maps menu is its own component, tested on its own
vi.mock('@/molecules/ResourceMap/ResourceMapsMenu', () => ({
  ResourceMapsMenu: () => <button type="button">Open in Maps</button>,
}));

const DATE: TPinakesResourceDetail = meetupDateFixture;
const FEED_CARD: TPinakesResourceDetail = meetupFeedFixture;
const DATES: TPinakesCard[] = meetupDatesFixture.items;
const OTHER_DATES = DATES.filter((card) => card.start !== DATE.start);
const FEED = { id: FEED_CARD.id, uri: FEED_CARD.uri };
const WORKSHOP: TPinakesCard = {
  ...DATES[2],
  uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/317000001/',
  name: 'Lightning workshop',
};

const dates = (overrides: Partial<UseEventDatesResult> = {}): UseEventDatesResult => ({
  feed: FEED,
  sameName: OTHER_DATES,
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

const section = (name: string | RegExp) => screen.getByRole('region', { name });

describe('ResourceOtherDatesList', () => {
  beforeEach(() => {
    mocks.dates = dates();
    mocks.asked.length = 0;
    mocks.feedCard = { data: FEED_CARD, isLoading: false, isError: false };
    mocks.feedAsked.length = 0;
  });

  it('lists the series’ other dates under “Other dates · N”, at the page’s anchor, each a link to its page', () => {
    render(<ResourceOtherDatesList card={DATE} locale="en-US" isAnchor />);

    const list = section('Other dates');
    expect(list).toHaveAttribute('id', 'other-dates');
    expect(within(list).getByText('Other dates · 9')).toBeInTheDocument();
    const rows = within(list).getAllByTestId('resource-occurrence');
    // The first page of rows, as Upcoming dates shows them
    expect(rows).toHaveLength(5);
    const link = within(rows[0]).getByRole('link', { name: /^Bitcoin Meetup Zürich/ });
    expect(link).toHaveAttribute('href', getResourceRoute(OTHER_DATES[0].uri));
    expect(link).not.toHaveAttribute('target');
    expect(rows[0].textContent?.replace(/\s/g, ' ')).toContain('Nov 25, 2026, 6:00 – 9:00 PM UTC');
    expect(mocks.asked).toEqual([[DATE, { enabled: true }]]);
  });

  it('has the anchor’s id only on the copy that holds it: the page lays its sidebar out more than once', () => {
    render(<ResourceOtherDatesList card={DATE} locale="en-US" />);

    expect(section('Other dates')).not.toHaveAttribute('id');
  });

  it('brings the section into view when the page was opened at it, on the copy that is on screen', () => {
    window.history.replaceState(null, '', '#other-dates');
    const scrolled: Element[] = [];
    // jsdom lays nothing out and has no scrolling
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      // Only the copy without the id is laid out (the phone's)
      return asOpaque<DOMRectList>(this.id ? [] : [new DOMRect()]);
    });
    render(
      <>
        <ResourceOtherDatesList card={DATE} isAnchor />
        <ResourceOtherDatesList card={DATE} />
      </>,
    );

    const [, phone] = screen.getAllByRole('region', { name: 'Other dates' });
    expect(scrolled).toContain(phone);
    expect(new Set(scrolled)).toEqual(new Set([phone]));
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '#');
  });

  it('keeps the Maps menu of a row apart from its link', () => {
    const located = OTHER_DATES.map((card) => ({ ...card, point: { lat: 47.37, lon: 8.53 } }));
    mocks.dates = dates({ sameName: located });
    render(<ResourceOtherDatesList card={DATE} locale="en-US" />);

    const [row] = within(section('Other dates')).getAllByTestId('resource-occurrence');
    const maps = within(row).getByRole('button', { name: 'Open in Maps' });
    expect(maps.closest('a')).toBeNull();
  });

  it('shows the next dates with “Show more dates”, then reads past the first read', () => {
    const loadMore = vi.fn(async () => {});
    mocks.dates = dates({ hasMore: true, loadMore });
    render(<ResourceOtherDatesList card={DATE} locale="en-US" />);

    fireEvent.click(screen.getByTestId('resource-other-dates-toggle'));
    expect(within(section('Other dates')).getAllByTestId('resource-occurrence')).toHaveLength(9);
    // All read ones show: the next ones are asked of Pinakes
    expect(loadMore).toHaveBeenCalledOnce();
    expect(within(section(/^Other dates/)).getByText('Other dates · 9+')).toBeInTheDocument();
  });

  it('shows the section’s skeleton rows while the dates are read, and nothing while the feed is looked up', () => {
    mocks.dates = dates({ sameName: [], isLoading: true });
    const { unmount } = render(<ResourceOtherDatesList card={DATE} />);
    expect(screen.getByTestId('resource-other-dates-loading')).toBeInTheDocument();
    expect(section('Other dates')).toHaveAttribute('aria-busy', 'true');
    unmount();

    mocks.dates = dates({ feed: null, sameName: [], isLoading: true });
    const { container } = render(<ResourceOtherDatesList card={DATE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says the dates could not be loaded, with “Try again”', () => {
    const retry = vi.fn();
    mocks.dates = dates({ sameName: [], isError: true, retry });
    render(<ResourceOtherDatesList card={DATE} />);

    expect(screen.getByTestId('resource-other-dates-message')).toHaveTextContent('Other dates could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows nothing for a series with no other coming date, and for an event with no feed', () => {
    mocks.dates = dates({ sameName: [] });
    const { container, rerender } = render(<ResourceOtherDatesList card={DATE} />);
    expect(container).toBeEmptyDOMElement();

    mocks.dates = dates({ feed: null, sameName: [] });
    rerender(<ResourceOtherDatesList card={DATE} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.feedAsked.every((uri) => uri === null)).toBe(true);
  });

  it('lists the feed’s other events under “More from <feed>”, named by one read of the feed', () => {
    mocks.dates = dates({ others: [WORKSHOP] });
    render(<ResourceOtherDatesList card={DATE} locale="en-US" />);

    const more = section('More from Bitcoin Switzerland 🇨🇭');
    const [row] = within(more).getAllByTestId('resource-occurrence');
    expect(within(row).getByRole('link', { name: /^Lightning workshop/ })).toHaveAttribute(
      'href',
      getResourceRoute(WORKSHOP.uri),
    );
    expect(mocks.feedAsked).toContain(FEED.uri);
  });

  it('shows no “More from” while the feed is read, nor when the feed has only this event', () => {
    mocks.dates = dates({ others: [WORKSHOP] });
    mocks.feedCard = { data: undefined, isLoading: true, isError: false };
    const { rerender } = render(<ResourceOtherDatesList card={DATE} />);
    expect(screen.queryByRole('region', { name: /^More from/ })).toBeNull();

    mocks.dates = dates();
    mocks.feedCard = { data: FEED_CARD, isLoading: false, isError: false };
    rerender(<ResourceOtherDatesList card={DATE} />);
    expect(screen.queryByRole('region', { name: /^More from/ })).toBeNull();
  });
});
