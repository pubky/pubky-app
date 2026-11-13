import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResourceServicesQuery } from '@/pipes/resource/resource.search';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import kindOfBlueEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-release-group.enriched.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import occurrencesFixture from '@/services/pinakes/fixtures/occurrences.holidays.json';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import { PinakesService } from '@/services/pinakes/pinakes';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asInvalid } from '@/test-utils/type-assertions';
import { PinakesApplication } from './pinakes';

vi.mock('@/services/pinakes/pinakes', () => ({
  PinakesService: {
    fetchCardByUri: vi.fn(),
    fetchRelated: vi.fn(),
    fetchGroup: vi.fn(),
    getCachedGroup: vi.fn(),
    resolveCard: vi.fn(),
    fetchCardById: vi.fn(),
    seedCardByUri: vi.fn(),
    search: vi.fn(),
    getCachedSearch: vi.fn(),
    fetchOccurrences: vi.fn(),
  },
}));

const MALFORMED_CREDITS = asInvalid<TPinakesResourceDetail['credits']>([
  'wikipedia',
  { field: 'description', provider: 'wikipedia' },
  ...(kindOfBlueEnrichedFixture.credits ?? []),
]);

describe('PinakesApplication', () => {
  it('reads the facets of a first page already read with the parameters its read used, without a request', async () => {
    const query = getResourceServicesQuery(['music.amazon.com', 'open.spotify.com']);
    const facets = { host: [{ host: 'music.amazon.com', site: 'Amazon Music', count: 1 }] };
    vi.mocked(PinakesService.search).mockResolvedValue({ items: [], reach_truncated: false, facets });
    vi.mocked(PinakesService.getCachedSearch).mockReturnValue({ items: [], reach_truncated: false, facets });

    await PinakesApplication.searchResources(query, { limit: 1, cursor: undefined, facets: true });
    expect(PinakesApplication.getCachedSearchFacets(query, 1)).toBe(facets);
    expect(PinakesService.getCachedSearch).toHaveBeenCalledWith(vi.mocked(PinakesService.search).mock.calls[0][0]);

    vi.mocked(PinakesService.getCachedSearch).mockReturnValue(undefined);
    expect(PinakesApplication.getCachedSearchFacets(query, 1)).toBeUndefined();
  });

  it('returns the card the service reads', async () => {
    vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue(videoFixture);

    await expect(PinakesApplication.fetchCardByUri(videoFixture.uri)).resolves.toBe(videoFixture);
    expect(PinakesService.fetchCardByUri).toHaveBeenCalledWith(videoFixture.uri, undefined);
  });

  it('returns a card with valid credits as Pinakes sends it', async () => {
    vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue(kindOfBlueEnrichedFixture);

    await expect(PinakesApplication.fetchCardByUri(kindOfBlueEnrichedFixture.uri)).resolves.toEqual(
      kindOfBlueEnrichedFixture,
    );
  });

  it('drops malformed credits from a card', async () => {
    vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue({
      ...kindOfBlueEnrichedFixture,
      credits: MALFORMED_CREDITS,
    });

    const card = await PinakesApplication.fetchCardByUri(kindOfBlueEnrichedFixture.uri);

    expect(card?.credits).toEqual(kindOfBlueEnrichedFixture.credits);
  });

  it('answers no card as null', async () => {
    vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue(null);

    await expect(PinakesApplication.fetchCardByUri('https://example.com/a')).resolves.toBeNull();
  });

  it('returns the related cards the service reads, with their credits validated', async () => {
    vi.mocked(PinakesService.fetchRelated).mockResolvedValue([
      ...relatedFixture.items,
      { ...kindOfBlueEnrichedFixture, credits: MALFORMED_CREDITS },
    ]);

    const cards = await PinakesApplication.fetchRelated(videoFixture.id, 5);

    expect(cards.slice(0, -1)).toEqual(relatedFixture.items);
    expect(cards.at(-1)?.credits).toEqual(kindOfBlueEnrichedFixture.credits);
    expect(PinakesService.fetchRelated).toHaveBeenCalledWith(videoFixture.id, 5);
  });

  it('returns the group the service reads, with its members’ credits validated', async () => {
    vi.mocked(PinakesService.fetchGroup).mockResolvedValue({
      ...groupFixture,
      members: [...groupFixture.members, { ...kindOfBlueEnrichedFixture, credits: MALFORMED_CREDITS }],
    });

    const group = await PinakesApplication.fetchGroup(groupFixture.id);

    expect(group?.members.slice(0, -1)).toEqual(groupFixture.members);
    expect(group?.members.at(-1)?.credits).toEqual(kindOfBlueEnrichedFixture.credits);
    expect(PinakesService.fetchGroup).toHaveBeenCalledWith(groupFixture.id);
  });

  it('answers a gone group as null', async () => {
    vi.mocked(PinakesService.fetchGroup).mockResolvedValue(null);

    await expect(PinakesApplication.fetchGroup(groupFixture.id)).resolves.toBeNull();
  });

  it('gives a group already read without asking Pinakes, its members’ credits validated as read', () => {
    vi.mocked(PinakesService.getCachedGroup).mockReturnValue({
      ...groupFixture,
      members: [...groupFixture.members, { ...kindOfBlueEnrichedFixture, credits: MALFORMED_CREDITS }],
    });

    const group = PinakesApplication.getCachedGroup(groupFixture.id);

    expect(group?.members.slice(0, -1)).toEqual(groupFixture.members);
    expect(group?.members.at(-1)?.credits).toEqual(kindOfBlueEnrichedFixture.credits);
    expect(PinakesService.getCachedGroup).toHaveBeenCalledWith(groupFixture.id);
    expect(PinakesService.fetchGroup).not.toHaveBeenCalled();
  });

  it('gives no group when none was read, and null for a gone one', () => {
    vi.mocked(PinakesService.getCachedGroup).mockReturnValueOnce(undefined).mockReturnValueOnce(null);

    expect(PinakesApplication.getCachedGroup(groupFixture.id)).toBeUndefined();
    expect(PinakesApplication.getCachedGroup(groupFixture.id)).toBeNull();
  });

  describe('resolveCard', () => {
    const URI = 'https://www.fedlex.admin.ch/eli/cc/2022/151/de';
    const pending = { ...videoFixture, id: 'r-1', uri: URI, status: 'pending', name: null };
    const read = { ...videoFixture, id: 'r-1', uri: URI, name: 'Verordnung' };

    afterEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    it('returns a card read at once and puts it in the link’s card cache', async () => {
      vi.mocked(PinakesService.resolveCard).mockResolvedValue(read);

      await expect(PinakesApplication.resolveCard(URI)).resolves.toBe(read);
      expect(PinakesService.seedCardByUri).toHaveBeenCalledWith(URI, read);
      expect(PinakesService.fetchCardById).not.toHaveBeenCalled();
    });

    it('reads a pending answer again by its ID until the card is read, then caches it', async () => {
      vi.useFakeTimers();
      vi.mocked(PinakesService.resolveCard).mockResolvedValue(pending);
      vi.mocked(PinakesService.fetchCardById).mockResolvedValueOnce(pending).mockResolvedValueOnce(read);

      const result = PinakesApplication.resolveCard(URI);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(PinakesService.fetchCardById).toHaveBeenCalledTimes(1);
      expect(PinakesService.fetchCardById).toHaveBeenCalledWith('r-1');
      await vi.advanceTimersByTimeAsync(4_000);

      await expect(result).resolves.toBe(read);
      expect(PinakesService.fetchCardById).toHaveBeenCalledTimes(2);
      expect(PinakesService.seedCardByUri).toHaveBeenCalledWith(URI, read);
    });

    it('stops after about two minutes with the card still pending, and caches nothing', async () => {
      vi.useFakeTimers();
      vi.mocked(PinakesService.resolveCard).mockResolvedValue(pending);
      vi.mocked(PinakesService.fetchCardById).mockResolvedValue(pending);

      const result = PinakesApplication.resolveCard(URI);
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      await expect(result).resolves.toBe(pending);
      expect(PinakesService.fetchCardById).toHaveBeenCalledTimes(7);
      expect(PinakesService.seedCardByUri).not.toHaveBeenCalled();
    });

    it('answers null when Pinakes refused the link', async () => {
      vi.mocked(PinakesService.resolveCard).mockResolvedValue(null);

      await expect(PinakesApplication.resolveCard(URI)).resolves.toBeNull();
      expect(PinakesService.seedCardByUri).not.toHaveBeenCalled();
    });
  });
});

describe('PinakesApplication.fetchOccurrences', () => {
  afterEach(() => vi.mocked(PinakesService.fetchOccurrences).mockReset());

  it('reads a page of a calendar’s dates and gives its rows with the next page’s cursor', async () => {
    vi.mocked(PinakesService.fetchOccurrences).mockResolvedValue(occurrencesFixture);

    const page = await PinakesApplication.fetchOccurrences('feed', { from: '2026-11-13T00:00:00Z', limit: 3 });

    expect(PinakesService.fetchOccurrences).toHaveBeenCalledWith(
      'feed',
      { from: '2026-11-13T00:00:00Z', limit: 3, cursor: undefined },
      { fresh: undefined },
    );
    expect(page.cards).toEqual(occurrencesFixture.items);
    expect(page.cursor).toBe(occurrencesFixture.cursor);
  });

  it('asks past the cache only for a list started over, as the service’s own option and no part of the window', async () => {
    vi.mocked(PinakesService.fetchOccurrences).mockResolvedValue(occurrencesFixture);
    const window = { from: '2026-11-13T00:00:00Z', limit: 3 };

    await PinakesApplication.fetchOccurrences('feed', { ...window, fresh: true });
    await PinakesApplication.fetchOccurrences('feed', window);

    const [started, plain] = vi.mocked(PinakesService.fetchOccurrences).mock.calls;
    expect(started).toEqual(['feed', { ...window, cursor: undefined }, { fresh: true }]);
    expect(started[1]).not.toHaveProperty('fresh');
    expect(plain[2]?.fresh).toBeFalsy();
  });

  it('answers a resource Pinakes does not know, or no Pinakes, as no dates', async () => {
    vi.mocked(PinakesService.fetchOccurrences).mockResolvedValue(null);

    await expect(
      PinakesApplication.fetchOccurrences('gone', { from: '2026-11-13T00:00:00Z', limit: 3 }),
    ).resolves.toEqual({ cards: [], cursor: null });
  });
});

describe('PinakesApplication.fetchEventInstances', () => {
  const ROWS: TPinakesCard[] = eventsFixture.items;
  const CONCERT = ROWS.find((card) => card.name === 'Annett Louisan @ Volkshaus')!;
  // The concert's own read: what its row says, with the details only a read has
  const concertDetails: TPinakesResourceDetail = { ...eventFixture, ...CONCERT };

  afterEach(() => vi.mocked(PinakesService.fetchCardByUri).mockReset());

  it('reads the details of each event that is no calendar occurrence, and never an occurrence’s feed', async () => {
    vi.mocked(PinakesService.fetchCardByUri).mockImplementation(async (uri) =>
      uri === CONCERT.uri ? concertDetails : null,
    );

    const instances = await PinakesApplication.fetchEventInstances(ROWS);

    const read = vi.mocked(PinakesService.fetchCardByUri).mock.calls.map(([uri]) => uri);
    expect(read).toEqual(ROWS.filter((card) => !card.occurrence).map((card) => card.uri));
    expect(read).not.toContain(ROWS[0].uri);
    // One instance per row, in the rows' order: the three holidays stay three rows
    expect(instances.map((instance) => instance.name)).toEqual(ROWS.map((card) => card.name));
    expect(instances.find((instance) => instance.id === CONCERT.id)?.tz).toBe('America/Chicago');
    expect(instances[0].occurrence?.uid).toBe(ROWS[0].occurrence?.uid);
    expect(instances[0].tz).toBeUndefined();
  });

  it('keeps a row as the search gave it when its details cannot be read', async () => {
    vi.mocked(PinakesService.fetchCardByUri).mockRejectedValue(new Error('down'));

    const instances = await PinakesApplication.fetchEventInstances([CONCERT]);

    expect(instances).toEqual([CONCERT]);
  });

  describe('details kept from before the event changed (the cache holds a card five minutes)', () => {
    // The row as the search gives it now: the concert moved to another day and hall
    const MOVED: TPinakesCard = {
      ...CONCERT,
      start: '2026-11-17T19:00:00Z',
      end: '2026-11-17T23:00:00Z',
      point: { lat: 47.3712, lon: 8.5363 },
    };
    const before: TPinakesResourceDetail = {
      ...concertDetails,
      venue: { name: 'Volkshaus' },
      event_status: 'scheduled',
    };
    const now: TPinakesResourceDetail = {
      ...concertDetails,
      ...MOVED,
      tz: 'Europe/Zurich',
      venue: { name: 'Kaufleuten' },
      event_status: 'rescheduled',
    };
    const readsOf = () => vi.mocked(PinakesService.fetchCardByUri).mock.calls;

    it('reads them again past the cache when they say another time or place than the row, and takes those', async () => {
      vi.mocked(PinakesService.fetchCardByUri).mockImplementation(async (_uri, options) =>
        options?.fresh ? now : before,
      );

      const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

      expect(readsOf()).toEqual([
        [MOVED.uri, undefined],
        [MOVED.uri, { fresh: true }],
      ]);
      expect(instance).toMatchObject({
        start: MOVED.start,
        end: MOVED.end,
        point: MOVED.point,
        tz: 'Europe/Zurich',
        venue: { name: 'Kaufleuten' },
        event_status: 'rescheduled',
      });
    });

    it('keeps the row as the search gave it when they cannot be read again: never the earlier venue or status', async () => {
      vi.mocked(PinakesService.fetchCardByUri).mockImplementation(async (_uri, options) => {
        if (options?.fresh) throw new Error('down');
        return before;
      });

      await expect(PinakesApplication.fetchEventInstances([MOVED])).resolves.toEqual([MOVED]);
    });

    it('reads once more only: a read that still differs (the row is the earlier one) gives its details to the row’s own times', async () => {
      vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue(now);

      const [instance] = await PinakesApplication.fetchEventInstances([CONCERT]);

      expect(readsOf()).toHaveLength(2);
      expect(instance).toMatchObject({ start: CONCERT.start, point: CONCERT.point, event_status: 'rescheduled' });
    });

    it('reads details that say what the row says once, from the cache', async () => {
      vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue(now);

      const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

      expect(readsOf()).toEqual([[MOVED.uri, undefined]]);
      expect(instance.venue?.name).toBe('Kaufleuten');
    });

    it('never reads again for a link that answers another resource: its details are not the row’s', async () => {
      vi.mocked(PinakesService.fetchCardByUri).mockResolvedValue({ ...before, id: 'another' });

      await expect(PinakesApplication.fetchEventInstances([MOVED])).resolves.toEqual([MOVED]);
      expect(readsOf()).toHaveLength(1);
    });
  });
});
