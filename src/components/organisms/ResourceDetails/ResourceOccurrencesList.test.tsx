import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseResourceOccurrencesResult } from '@/hooks/useResourceOccurrences/useResourceOccurrences';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import occurrencesFixture from '@/services/pinakes/fixtures/occurrences.holidays.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { ResourceOccurrencesList } from './ResourceOccurrencesList';

const mocks = vi.hoisted(() => ({ read: null as unknown, asked: [] as (string | null)[] }));

vi.mock('@/hooks/useResourceOccurrences/useResourceOccurrences', () => ({
  useResourceOccurrences: (id: string | null) => {
    mocks.asked.push(id);
    return mocks.read;
  },
}));

const DATES: TPinakesCard[] = occurrencesFixture.items;
const CALENDAR = { id: '2950248974677c9ca34f1f67b8a2da80', type: 'DataFeed', type_path: [] };

const read = (overrides: Partial<UseResourceOccurrencesResult> = {}): UseResourceOccurrencesResult => ({
  cards: DATES,
  isLoading: false,
  isError: false,
  hasMore: false,
  isLoadingMore: false,
  isMoreError: false,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});

const rows = () => within(screen.getByRole('region', { name: 'Upcoming dates' })).getAllByRole('listitem');

describe('ResourceOccurrencesList', () => {
  beforeEach(() => {
    mocks.read = read();
    mocks.asked.length = 0;
  });

  it('lists a calendar’s coming dates, each with its own name and time, though all share the calendar’s id', () => {
    render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    expect(mocks.asked).toEqual([CALENDAR.id]);
    expect(rows().map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual([
      'National Day of MourningNov 15, 2026, 12:00 AM UTC – Nov 16, 2026, 12:00 AM UTC',
      'Repentance Day (Saxony)Nov 18, 2026, 12:00 AM UTC – Nov 19, 2026, 12:00 AM UTC',
      'Sunday of the DeadNov 22, 2026, 12:00 AM UTC – Nov 23, 2026, 12:00 AM UTC',
    ]);
  });

  it('shows a timed date in UTC, named, when the calendar says no time zone', () => {
    const timed = { ...DATES[0], start: '2026-11-17T18:00:00Z', end: '2026-11-17T20:00:00Z' };
    mocks.read = read({ cards: [timed] });
    render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    // Intl separates the parts with narrow spaces
    expect(rows()[0].textContent?.replace(/\s/g, ' ')).toContain('Nov 17, 2026, 6:00 – 8:00 PM UTC');
  });

  it('never calls a date all-day on its times alone: a timed event from midnight to midnight UTC keeps its times', () => {
    // A 24-hour event that starts at 9:00 in Tokyo has these very timestamps
    const allNight = { ...DATES[0], name: 'Hackathon', start: '2026-11-21T00:00:00Z', end: '2026-11-22T00:00:00Z' };
    mocks.read = read({ cards: [allNight] });
    render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    expect(rows()[0].textContent?.replace(/\s/g, ' ')).toBe(
      'HackathonNov 21, 2026, 12:00 AM UTC – Nov 22, 2026, 12:00 AM UTC',
    );
  });

  it('ends a date that has a place with Open in Maps, and gives one without a place none', () => {
    const placed = { ...DATES[1], point: { lat: 47.37546, lon: 8.52722 } };
    mocks.read = read({ cards: [DATES[0], placed] });
    render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    const [first, second] = rows();
    expect(within(first).queryByRole('button', { name: 'Open in Maps' })).toBeNull();
    expect(within(second).getByRole('button', { name: 'Open in Maps' })).toBeInTheDocument();
    // Its name and time stay as they are
    expect(second).toHaveTextContent('Repentance Day (Saxony)');
    expect(second.textContent?.replace(/\s/g, ' ')).toContain('Nov 18, 2026, 12:00 AM UTC');
  });

  it('says when a date is cancelled or moved, and nothing for one going ahead', () => {
    const cancelled = { ...DATES[1], occurrence: { ...DATES[1].occurrence!, status: 'cancelled' } };
    const moved = { ...DATES[2], occurrence: { ...DATES[2].occurrence!, status: 'rescheduled' } };
    mocks.read = read({ cards: [DATES[0], cancelled, moved] });
    render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    const [first, second, third] = rows();
    expect(within(first).queryByTestId('resource-occurrence-status')).toBeNull();
    expect(within(second).getByTestId('resource-occurrence-status')).toHaveTextContent('Cancelled');
    expect(within(third).getByTestId('resource-occurrence-status')).toHaveTextContent('Rescheduled');
  });

  it('reads more dates on Show more, and has no such button at the end', () => {
    const loadMore = vi.fn(async () => {});
    mocks.read = read({ hasMore: true, loadMore });
    const { rerender } = render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    const more = screen.getByRole('button', { name: 'Show more dates' });
    // It reads more: it is no toggle of a hidden part
    expect(more).not.toHaveAttribute('aria-expanded');
    fireEvent.click(more);
    expect(loadMore).toHaveBeenCalledTimes(1);

    mocks.read = read({ hasMore: false });
    rerender(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);
    expect(screen.queryByRole('button', { name: 'Show more dates' })).toBeNull();
  });

  it('says so while more dates are read, and when they could not be', () => {
    mocks.read = read({ hasMore: true, isLoadingMore: true });
    const { rerender } = render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);
    expect(screen.getByRole('button', { name: 'Loading more dates' })).toBeInTheDocument();

    mocks.read = read({ hasMore: true, isMoreError: true });
    rerender(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);
    expect(screen.getByTestId('resource-occurrences-more-error')).toHaveTextContent('More dates could not be loaded');
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Show more dates' })).toBeInTheDocument();
  });

  it('shows the loading rows while a calendar’s dates are read', () => {
    mocks.read = read({ cards: [], isLoading: true });
    render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);

    expect(screen.getByRole('region', { name: 'Upcoming dates' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('resource-occurrences-loading')).toBeInTheDocument();
  });

  it('says so when a calendar has no coming dates, and when they could not be read', () => {
    mocks.read = read({ cards: [] });
    const { rerender } = render(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);
    expect(screen.getByTestId('resource-occurrences-message')).toHaveTextContent('No upcoming dates');

    const retry = vi.fn();
    mocks.read = read({ cards: [], isError: true, retry });
    rerender(<ResourceOccurrencesList card={CALENDAR} locale="en-US" />);
    expect(screen.getByTestId('resource-occurrences-message')).toHaveTextContent('Dates could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('asks an event for other dates too, and is not there while they are read or when it has none', () => {
    mocks.read = read({ cards: [], isLoading: true });
    const { rerender } = render(<ResourceOccurrencesList card={eventFixture} locale="en-US" />);
    expect(mocks.asked).toEqual([eventFixture.id]);
    expect(screen.queryByRole('region', { name: 'Upcoming dates' })).toBeNull();

    mocks.read = read({ cards: [] });
    rerender(<ResourceOccurrencesList card={eventFixture} locale="en-US" />);
    expect(screen.queryByRole('region', { name: 'Upcoming dates' })).toBeNull();

    mocks.read = read({ cards: [], isError: true });
    rerender(<ResourceOccurrencesList card={eventFixture} locale="en-US" />);
    expect(screen.queryByRole('region', { name: 'Upcoming dates' })).toBeNull();
  });

  it('reads nothing for a card that is neither a calendar nor an event', () => {
    render(<ResourceOccurrencesList card={videoFixture} locale="en-US" />);

    expect(mocks.asked).toEqual([null]);
    expect(screen.queryByRole('region', { name: 'Upcoming dates' })).toBeNull();
  });
});
