import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { type TEventInstance, toEventInstance } from '@/pipes/resource/resource.events';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { SearchEventAgenda } from './SearchEventAgenda';
import { formatEventDay } from './SearchEventAgenda.utils';

const mocks = vi.hoisted(() => ({
  instances: null as TEventInstance[] | null,
  isLoading: false,
  scroll: null as { isLoading: boolean; itemCount: number } | null,
  asked: [] as unknown[],
}));

// The rows' details are read by the hook (its own test): here each row is its own event at once
vi.mock('@/hooks/useEventInstances/useEventInstances', () => ({
  useEventInstances: (cards: TPinakesCard[]) => {
    mocks.asked.push(cards);
    return {
      instances: mocks.instances ?? cards.map((card) => ({ ...card, event_status: card.occurrence?.status })),
      isLoading: mocks.isLoading,
    };
  },
}));
vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: (options: { isLoading: boolean; itemCount: number }) => {
    mocks.scroll = options;
    return { sentinelRef: vi.fn(), isStalled: false, resumeAutoLoad: vi.fn() };
  },
}));
vi.mock('@/organisms/ResourceInstanceCard/ResourceInstanceCard', () => ({
  ResourceInstanceCard: ({ card }: { card: TEventInstance }) => (
    <div
      data-testid="event-card"
      data-id={card.id}
      data-uid={card.occurrence?.uid ?? ''}
      data-status={card.event_status ?? ''}
    >
      {card.name}
    </div>
  ),
}));

const ROWS: TPinakesCard[] = eventsFixture.items;

const search = (overrides: Partial<UseResourceSearchResult> = {}): UseResourceSearchResult => ({
  uris: [],
  cards: ROWS,
  typeFacets: null,
  relatedTags: [],
  hostFacets: null,
  categoryFacets: null,
  source: 'pinakes',
  unavailable: false,
  reachTruncated: false,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});

const days = () => screen.getAllByTestId('agenda-day');

describe('formatEventDay', () => {
  it('reads a day as a date block (month, day, weekday) and in full, whatever the viewer’s own time zone', () => {
    expect(formatEventDay('2026-11-15', 'en-US')).toEqual({
      month: 'Nov',
      day: '15',
      weekday: 'Sun',
      label: 'Sunday, November 15, 2026',
    });
    expect(formatEventDay('2026-01-01', 'en-US').weekday).toBe('Thu');
  });
});

describe('SearchEventAgenda', () => {
  beforeEach(() => {
    mocks.instances = null;
    mocks.isLoading = false;
    mocks.asked.length = 0;
  });

  it('lists the events by day, each day under its date block, in order', () => {
    render(<SearchEventAgenda search={search()} />);

    expect(mocks.asked.at(-1)).toBe(ROWS);
    expect(days().map((day) => within(day).getByRole('heading').textContent)).toEqual([
      'Sunday, November 15, 2026',
      'Monday, November 16, 2026',
      'Wednesday, November 18, 2026',
      'Saturday, November 21, 2026',
      'Sunday, November 22, 2026',
      'Wednesday, November 25, 2026',
    ]);
    const block = within(days()[0]).getByTestId('agenda-date-block');
    expect(block).toHaveTextContent('Nov');
    expect(block).toHaveTextContent('15');
    expect(block).toHaveTextContent('Sun');
    expect(within(days()[1]).getByTestId('event-card')).toHaveTextContent('Annett Louisan @ Volkshaus');
  });

  it('keeps a calendar’s occurrences as separate events though they share its id and link', () => {
    render(<SearchEventAgenda search={search()} />);

    const cards = screen.getAllByTestId('event-card');
    expect(cards).toHaveLength(ROWS.length);
    const holidays = cards.filter((card) => card.getAttribute('data-uid'));
    expect(holidays.map((card) => card.textContent)).toEqual([
      'National Day of Mourning',
      'Repentance Day (Saxony)',
      'Sunday of the Dead',
    ]);
    expect(new Set(holidays.map((card) => card.getAttribute('data-id'))).size).toBe(1);
  });

  it('puts two events of one day under one date block', () => {
    const sameDay = [ROWS[1], { ...ROWS[5], start: '2026-11-16T21:00:00Z' }];
    render(<SearchEventAgenda search={search({ cards: sameDay })} />);

    expect(days()).toHaveLength(1);
    expect(within(days()[0]).getAllByTestId('event-card')).toHaveLength(2);
  });

  it('leads from a calendar occurrence to its calendar’s page (which lists its dates), and says nothing of repeating without a sign of it', () => {
    render(<SearchEventAgenda search={search()} />);

    const holiday = within(days()[0]);
    expect(holiday.getByRole('link', { name: 'More from this calendar' })).toHaveAttribute(
      'href',
      getResourceRoute(ROWS[0].occurrence!.feed_uri),
    );
    // The calendar's other dates are other events: they are not called this event's other dates
    expect(holiday.queryByText(/other dates/i)).toBeNull();
    expect(holiday.queryByText('Repeats')).toBeNull();
    // An event that is no calendar occurrence has no calendar to lead to
    expect(within(days()[1]).queryByRole('link', { name: 'More from this calendar' })).toBeNull();
  });

  it('says an occurrence repeats only when Pinakes names the date of a repeating event it is', () => {
    const weekly = { ...ROWS[0], occurrence: { ...ROWS[0].occurrence!, recurrence_id: '20261115T000000Z' } };
    render(<SearchEventAgenda search={search({ cards: [weekly] })} />);

    expect(within(days()[0]).getByTestId('agenda-repeats')).toHaveTextContent('Repeats');
  });

  it('hands each card its event’s lifecycle (an occurrence’s own, or the event’s status), which the card says once', () => {
    const cancelled = { ...ROWS[0], occurrence: { ...ROWS[0].occurrence!, status: 'cancelled' } };
    mocks.instances = [toEventInstance(cancelled, null), { ...ROWS[1], event_status: 'rescheduled' }, ROWS[3]];
    render(<SearchEventAgenda search={search({ cards: [cancelled, ROWS[1], ROWS[3]] })} />);

    const statuses = screen.getAllByTestId('event-card').map((card) => card.getAttribute('data-status'));
    expect(statuses).toEqual(['cancelled', 'rescheduled', '']);
    // No second statement of it beside the card
    expect(screen.queryByText('Cancelled')).toBeNull();
    expect(screen.queryByText('Rescheduled')).toBeNull();
  });

  it('asks for no further page while the events’ details are still read, so pages do not pile up', () => {
    mocks.instances = ROWS.slice(0, 2).map((card) => toEventInstance(card, null));
    mocks.isLoading = true;
    render(<SearchEventAgenda search={search({ hasMore: true })} />);

    expect(mocks.scroll).toMatchObject({ isLoading: true, itemCount: 2 });
  });

  it('lists an event without a date last, under its own heading', () => {
    render(<SearchEventAgenda search={search({ cards: [{ ...ROWS[1], start: null }, ROWS[0]] })} />);

    expect(days().map((day) => within(day).getByRole('heading').textContent)).toEqual([
      'Sunday, November 15, 2026',
      'Date not known',
    ]);
  });

  it('says quietly that events on Pubky are coming, with nothing to press', () => {
    render(<SearchEventAgenda search={search()} />);

    const hint = screen.getByTestId('agenda-hint');
    expect(hint).toHaveTextContent('Events on Pubky are coming');
    expect(within(hint).queryByRole('button')).toBeNull();
    expect(within(hint).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /RSVP|Create|Going/i })).toBeNull();
  });

  it('shows the loading cards while the search is read, and while the first events’ details are', () => {
    const { rerender } = render(<SearchEventAgenda search={search({ cards: [], loading: true })} />);
    expect(screen.getByTestId('agenda-loading')).toBeInTheDocument();

    mocks.instances = [];
    mocks.isLoading = true;
    rerender(<SearchEventAgenda search={search()} />);
    expect(screen.getByTestId('agenda-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('agenda-day')).toBeNull();
  });

  it('says so when no event matches, and when the search failed, with a way to try again', () => {
    const { rerender } = render(<SearchEventAgenda search={search({ cards: [] })} />);
    expect(screen.getByText('No events found')).toBeInTheDocument();

    const retry = vi.fn();
    rerender(<SearchEventAgenda search={search({ cards: [], error: 'Pinakes is down', retry })} />);
    expect(screen.getByTestId('agenda-error')).toHaveTextContent('Pinakes is down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry for a search no source can answer', () => {
    render(<SearchEventAgenda search={search({ cards: [], error: 'Not available', unavailable: true })} />);

    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows that more events are being read under the ones listed', () => {
    render(<SearchEventAgenda search={search({ hasMore: true, loadingMore: true })} />);

    expect(days().length).toBeGreaterThan(0);
    expect(screen.getByRole('feed', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByTestId('agenda-loading-more')).toBeInTheDocument();
  });

  it('puts what it is given above the list (the search’s controls)', () => {
    render(
      <SearchEventAgenda search={search()}>
        <button type="button">Map</button>
      </SearchEventAgenda>,
    );

    const control = screen.getByRole('button', { name: 'Map' });
    expect(control.compareDocumentPosition(days()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
