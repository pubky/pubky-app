import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PinakesApplication } from '@/application/pinakes/pinakes';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import { PinakesController } from './pinakes';

vi.mock('@/application/pinakes/pinakes', () => ({
  PinakesApplication: {
    fetchCardByUri: vi.fn(),
    fetchRelated: vi.fn(),
    fetchGroup: vi.fn(),
    getCachedGroup: vi.fn(),
    resolveCard: vi.fn(),
    fetchOccurrences: vi.fn(),
    fetchEventInstances: vi.fn(),
  },
}));

describe('PinakesController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchCardByUri passes the link through and returns the card', async () => {
    vi.mocked(PinakesApplication.fetchCardByUri).mockResolvedValue(videoFixture);

    await expect(PinakesController.fetchCardByUri({ uri: videoFixture.uri })).resolves.toBe(videoFixture);
    expect(PinakesApplication.fetchCardByUri).toHaveBeenCalledWith(videoFixture.uri, { fresh: undefined });
  });

  it('fetchCardByUri returns no card as null', async () => {
    vi.mocked(PinakesApplication.fetchCardByUri).mockResolvedValue(null);

    await expect(PinakesController.fetchCardByUri({ uri: 'https://example.com/x' })).resolves.toBeNull();
  });

  it('fetchRelated passes the ID and limit through', async () => {
    vi.mocked(PinakesApplication.fetchRelated).mockResolvedValue(relatedFixture.items);

    await expect(PinakesController.fetchRelated({ id: videoFixture.id, limit: 5 })).resolves.toBe(relatedFixture.items);
    expect(PinakesApplication.fetchRelated).toHaveBeenCalledWith(videoFixture.id, 5);
  });

  it('fetchGroup passes the ID through', async () => {
    vi.mocked(PinakesApplication.fetchGroup).mockResolvedValue(groupFixture);

    await expect(PinakesController.fetchGroup({ id: groupFixture.id })).resolves.toBe(groupFixture);
    expect(PinakesApplication.fetchGroup).toHaveBeenCalledWith(groupFixture.id);
  });

  it('getCachedGroup gives the group already read, asking nothing', () => {
    vi.mocked(PinakesApplication.getCachedGroup).mockReturnValue(groupFixture);

    expect(PinakesController.getCachedGroup({ id: groupFixture.id })).toBe(groupFixture);
    expect(PinakesApplication.getCachedGroup).toHaveBeenCalledWith(groupFixture.id);
    expect(PinakesApplication.fetchGroup).not.toHaveBeenCalled();
  });

  it('lets a Pinakes failure reach the caller unchanged', async () => {
    const failure = new Error('pinakes down');
    vi.mocked(PinakesApplication.fetchGroup).mockRejectedValue(failure);

    await expect(PinakesController.fetchGroup({ id: groupFixture.id })).rejects.toBe(failure);
  });

  it('fetchCardByUri asks past the cache when told to', async () => {
    vi.mocked(PinakesApplication.fetchCardByUri).mockResolvedValue(null);

    await PinakesController.fetchCardByUri({ uri: videoFixture.uri, fresh: true });
    expect(PinakesApplication.fetchCardByUri).toHaveBeenCalledWith(videoFixture.uri, { fresh: true });
  });

  it('resolveCard passes the link through and returns the card', async () => {
    vi.mocked(PinakesApplication.resolveCard).mockResolvedValue(videoFixture);

    await expect(PinakesController.resolveCard({ uri: videoFixture.uri })).resolves.toBe(videoFixture);
    expect(PinakesApplication.resolveCard).toHaveBeenCalledWith(videoFixture.uri);
  });

  describe('fetchOccurrences', () => {
    afterEach(() => vi.useRealTimers());

    it('lists a calendar’s dates from now on, as an RFC 3339 time and never the search’s relative now', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-13T17:05:42Z'));
      vi.mocked(PinakesApplication.fetchOccurrences).mockResolvedValue({ cards: [], cursor: null });

      await PinakesController.fetchOccurrences({ id: 'feed', limit: 5 });

      expect(PinakesApplication.fetchOccurrences).toHaveBeenCalledWith('feed', {
        from: '2026-11-13T17:05:00Z',
        limit: 5,
        cursor: undefined,
      });
    });

    it('asks a later page in the first page’s window, so its cursor still fits', async () => {
      vi.mocked(PinakesApplication.fetchOccurrences).mockResolvedValue({ cards: [], cursor: null });

      await PinakesController.fetchOccurrences({ id: 'feed', limit: 5, cursor: 'c2', from: '2026-11-13T17:05:00Z' });

      expect(PinakesApplication.fetchOccurrences).toHaveBeenCalledWith('feed', {
        from: '2026-11-13T17:05:00Z',
        limit: 5,
        cursor: 'c2',
      });
    });

    it('asks past the cache for a list started over, and not otherwise', async () => {
      vi.mocked(PinakesApplication.fetchOccurrences).mockResolvedValue({ cards: [], cursor: null });
      const from = '2026-11-13T17:05:00Z';

      await PinakesController.fetchOccurrences({ id: 'feed', limit: 5, from, fresh: true });
      await PinakesController.fetchOccurrences({ id: 'feed', limit: 5, from });

      const [started, plain] = vi.mocked(PinakesApplication.fetchOccurrences).mock.calls;
      expect(started[1].fresh).toBe(true);
      expect(plain[1].fresh).toBeFalsy();
    });
  });

  it('fetchEventInstances passes the search rows through', async () => {
    vi.mocked(PinakesApplication.fetchEventInstances).mockResolvedValue([]);

    await expect(PinakesController.fetchEventInstances({ cards: relatedFixture.items })).resolves.toEqual([]);
    expect(PinakesApplication.fetchEventInstances).toHaveBeenCalledWith(relatedFixture.items);
  });
});
