import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import { pinakesQueryClient } from '@/services/pinakes/pinakes.query-client';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { PinakesApplication } from './pinakes';

// The application over the real service and its cache: only Pinakes' origin and the transport are
// stood in for.
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  getPinakesUrl: () => 'https://pinakes.example',
}));

const ROWS: TPinakesCard[] = eventsFixture.items;
const CONCERT = ROWS.find((card) => card.name === 'Annett Louisan @ Volkshaus')!;
/** The row as the search gives it after the concert moved to another day and hall. */
const MOVED: TPinakesCard = {
  ...CONCERT,
  start: '2026-11-17T19:00:00Z',
  end: '2026-11-17T23:00:00Z',
  point: { lat: 47.3712, lon: 8.5363 },
};
const before: TPinakesResourceDetail = {
  ...eventFixture,
  ...CONCERT,
  tz: 'Europe/Zurich',
  venue: { name: 'Volkshaus' },
  event_status: 'scheduled',
};
const now: TPinakesResourceDetail = {
  ...before,
  ...MOVED,
  venue: { name: 'Kaufleuten' },
  event_status: 'rescheduled',
};
const mockFetch = vi.fn();
const answer = (card: TPinakesResourceDetail) =>
  new Response(JSON.stringify(card), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('PinakesApplication.fetchEventInstances over the cached card reads', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T17:05:00Z'));
    pinakesQueryClient.clear();
    mockFetch.mockReset();
    global.fetch = asOpaque<typeof global.fetch>(mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = realFetch;
  });

  it('asks Pinakes again for details the cache holds from before the event moved, and shows the new ones', async () => {
    mockFetch.mockResolvedValueOnce(answer(before)).mockResolvedValueOnce(answer(now));
    // The concert's card was read two minutes ago (a post's card, an earlier search)
    await PinakesApplication.fetchCardByUri(CONCERT.uri);
    vi.setSystemTime(new Date('2026-11-13T17:07:00Z'));

    const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(instance).toMatchObject({
      start: MOVED.start,
      point: MOVED.point,
      venue: { name: 'Kaufleuten' },
      event_status: 'rescheduled',
    });
  });

  it('asks once for details it had not read, though they differ from the row: asking again would say the same', async () => {
    mockFetch.mockImplementation(async () => answer(before));

    const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // The row's own time and place, with the details Pinakes has now
    expect(instance).toMatchObject({ start: MOVED.start, point: MOVED.point, venue: { name: 'Volkshaus' } });
  });

  it('asks nothing for details the cache holds that say what the row says', async () => {
    mockFetch.mockResolvedValueOnce(answer(now));
    await PinakesApplication.fetchCardByUri(MOVED.uri);
    vi.setSystemTime(new Date('2026-11-13T17:07:00Z'));

    const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(instance.venue?.name).toBe('Kaufleuten');
  });
});
