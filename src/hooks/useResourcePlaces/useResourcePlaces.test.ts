import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINAKES_SEARCH_DEBOUNCE_MS } from '@/config/pinakes';
import { ResourceController } from '@/controllers/resource/resource';
import { useResourcePlaces } from './useResourcePlaces';

const ZURICH = { id: 'zh', name: 'Zürich', point: { lat: 47.37444, lon: 8.54111 } };

describe('useResourcePlaces', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks nothing for a name shorter than 2 letters', async () => {
    const fetch = vi.spyOn(ResourceController, 'fetchPlaces').mockResolvedValue([ZURICH]);
    const { result } = renderHook(() => useResourcePlaces(' z '));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PINAKES_SEARCH_DEBOUNCE_MS * 2);
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ places: [], loading: false, failed: false });
  });

  it('asks nothing for a name holding a link with credentials', async () => {
    const fetch = vi.spyOn(ResourceController, 'fetchPlaces').mockResolvedValue([ZURICH]);
    const { result } = renderHook(() => useResourcePlaces('cafe https://user:secret@example.com'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PINAKES_SEARCH_DEBOUNCE_MS * 2);
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ places: [], loading: false, failed: false });
  });

  it('asks once the name is still, and drops an answer for an older name', async () => {
    let answer: (places: (typeof ZURICH)[]) => void = () => {};
    const fetch = vi
      .spyOn(ResourceController, 'fetchPlaces')
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
      .mockResolvedValueOnce([ZURICH]);
    const { result, rerender } = renderHook(({ name }) => useResourcePlaces(name), { initialProps: { name: 'zu' } });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PINAKES_SEARCH_DEBOUNCE_MS);
    });
    expect(fetch).toHaveBeenLastCalledWith('zu', 5);

    rerender({ name: 'zür' });
    rerender({ name: 'züri' });
    await act(async () => {
      answer([{ ...ZURICH, name: 'old' }]);
      await vi.advanceTimersByTimeAsync(PINAKES_SEARCH_DEBOUNCE_MS);
    });
    // One read for the still name, none for the one typed past
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('züri', 5);
    expect(result.current).toEqual({ places: [ZURICH], loading: false, failed: false });
  });

  it('offers no place and says so when the read fails', async () => {
    vi.spyOn(ResourceController, 'fetchPlaces').mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useResourcePlaces('zurich'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PINAKES_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current).toEqual({ places: [], loading: false, failed: true });
  });
});
