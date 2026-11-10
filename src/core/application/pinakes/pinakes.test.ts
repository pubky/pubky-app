import { afterEach, describe, expect, it, vi } from 'vitest';
import kindOfBlueEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-release-group.enriched.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import { PinakesService } from '@/services/pinakes/pinakes';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asInvalid } from '@/test-utils/type-assertions';
import { PinakesApplication } from './pinakes';

vi.mock('@/services/pinakes/pinakes', () => ({
  PinakesService: {
    fetchCardByUri: vi.fn(),
    fetchRelated: vi.fn(),
    fetchGroup: vi.fn(),
    resolveCard: vi.fn(),
    fetchCardById: vi.fn(),
    seedCardByUri: vi.fn(),
  },
}));

const MALFORMED_CREDITS = asInvalid<TPinakesResourceDetail['credits']>([
  'wikipedia',
  { field: 'description', provider: 'wikipedia' },
  ...(kindOfBlueEnrichedFixture.credits ?? []),
]);

describe('PinakesApplication', () => {
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
