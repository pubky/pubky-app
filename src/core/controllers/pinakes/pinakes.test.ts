import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
