import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import { usePinakesRelated } from './usePinakesRelated';

const mocks = vi.hoisted(() => ({ configured: true, fetchRelated: vi.fn() }));

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => mocks.configured, PINAKES_RELATED_LIMIT: 5 }));
vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: { fetchRelated: mocks.fetchRelated },
}));

const ID = '0f3820de1c3532e8805674cc996978f9';

describe('usePinakesRelated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured = true;
  });

  it('reads the related cards with the default limit', async () => {
    mocks.fetchRelated.mockResolvedValue(relatedFixture.items);

    const { result } = renderHook(() => usePinakesRelated(ID));

    await waitFor(() => expect(result.current.data).toEqual(relatedFixture.items));
    expect(mocks.fetchRelated).toHaveBeenCalledWith({ id: ID, limit: 5 });
  });

  it('passes a caller limit through', async () => {
    mocks.fetchRelated.mockResolvedValue([]);

    renderHook(() => usePinakesRelated(ID, 12));

    await waitFor(() => expect(mocks.fetchRelated).toHaveBeenCalledWith({ id: ID, limit: 12 }));
  });

  it('reads nothing until it is given an ID', () => {
    const { result } = renderHook(() => usePinakesRelated(null));

    expect(result.current).toEqual({ data: null, isLoading: false, isError: false });
    expect(mocks.fetchRelated).not.toHaveBeenCalled();
  });

  it('makes no request when Pinakes is not configured', () => {
    mocks.configured = false;

    renderHook(() => usePinakesRelated(ID));

    expect(mocks.fetchRelated).not.toHaveBeenCalled();
  });
});
