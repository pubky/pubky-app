import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TPinakesEpisode } from '@/services/pinakes/pinakes.types';
import { SHOW_EPISODES_PAGE_SIZE, useShowEpisodes } from './useShowEpisodes';

const mocks = vi.hoisted(() => ({ configured: true, fetchEpisodes: vi.fn() }));

vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => mocks.configured,
}));
vi.mock('@/controllers/pinakes/pinakes', () => ({ PinakesController: { fetchEpisodes: mocks.fetchEpisodes } }));

const SHOW = '5988142d26dde2e4a9e9e5e064d0e9b0';
const episode = (n: number): TPinakesEpisode => ({
  uri: `https://lexfridman.com/feed/podcast/?guid=https://lexfridman.com/?p=${n}`,
  name: `#${n} – Episode ${n}`,
  guid: `https://lexfridman.com/?p=${n}`,
  stream: { url: `https://media.example.com/${n}.mp3`, type: 'audio/mpeg', preview: false },
});

describe('useShowEpisodes', () => {
  beforeEach(() => {
    mocks.configured = true;
    mocks.fetchEpisodes.mockReset();
  });

  it('reads the first page, then the next from its offset, newest first', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504), episode(503)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(502)], next_offset: null });

    const { result } = renderHook(() => useShowEpisodes(SHOW));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.fetchEpisodes).toHaveBeenLastCalledWith({ id: SHOW, limit: SHOW_EPISODES_PAGE_SIZE, q: null });
    expect(result.current.hasMore).toBe(true);

    await act(() => result.current.loadMore());
    expect(mocks.fetchEpisodes).toHaveBeenLastCalledWith({ id: SHOW, limit: 20, offset: 20, q: null });
    expect(result.current.episodes.map((item) => item.name)).toEqual([
      '#504 – Episode 504',
      '#503 – Episode 503',
      '#502 – Episode 502',
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('searches the titles with q, from the first page, and pages that search', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(500)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(400)], next_offset: null });

    const { result, rerender } = renderHook(({ q }) => useShowEpisodes(SHOW, q), { initialProps: { q: '' } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ q: ' khabib ' });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.fetchEpisodes).toHaveBeenLastCalledWith({ id: SHOW, limit: 20, q: 'khabib' });
    expect(result.current.episodes.map((item) => item.guid)).toEqual(['https://lexfridman.com/?p=500']);

    await act(() => result.current.loadMore());
    expect(mocks.fetchEpisodes).toHaveBeenLastCalledWith({ id: SHOW, limit: 20, offset: 20, q: 'khabib' });
    expect(result.current.episodes).toHaveLength(2);
  });

  it('lists an episode once when a page repeats one', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504), episode(503)], next_offset: 2 })
      .mockResolvedValueOnce({ items: [episode(503), episode(502)], next_offset: null });

    const { result } = renderHook(() => useShowEpisodes(SHOW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());

    expect(result.current.episodes.map((item) => item.guid)).toHaveLength(3);
  });

  it('ends the list at a page that is empty or points back', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(503)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [], next_offset: 40 });

    const { result } = renderHook(() => useShowEpisodes(SHOW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());
    expect(result.current.hasMore).toBe(false);

    const empty = renderHook(() => useShowEpisodes(SHOW, 'zzz'));
    await waitFor(() => expect(empty.result.current.isLoading).toBe(false));
    expect(empty.result.current.hasMore).toBe(false);
  });

  it('keeps the episodes read when the next page fails, and asks again on loadMore', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ items: [episode(503)], next_offset: null });

    const { result } = renderHook(() => useShowEpisodes(SHOW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.loadMore());
    expect(result.current.isMoreError).toBe(true);
    expect(result.current.episodes).toHaveLength(1);

    await act(() => result.current.loadMore());
    expect(result.current.isMoreError).toBe(false);
    expect(result.current.episodes).toHaveLength(2);
  });

  it('says when the first page fails, and reads it again on retry', async () => {
    mocks.fetchEpisodes.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [episode(504)] });

    const { result } = renderHook(() => useShowEpisodes(SHOW));
    await waitFor(() => expect(result.current.isError).toBe(true));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.episodes).toHaveLength(1));
    expect(mocks.fetchEpisodes).toHaveBeenCalledTimes(2);
    expect(result.current.hasMore).toBe(false);
  });

  it('reads nothing without a show or without Pinakes', () => {
    const { result } = renderHook(() => useShowEpisodes(null));
    expect(result.current.isLoading).toBe(false);
    mocks.configured = false;
    renderHook(() => useShowEpisodes(SHOW));
    expect(mocks.fetchEpisodes).not.toHaveBeenCalled();
  });
  it('says the feed lists older episodes than Pinakes keeps once any page says so', async () => {
    mocks.fetchEpisodes
      .mockResolvedValueOnce({ items: [episode(504)], next_offset: 20 })
      .mockResolvedValueOnce({ items: [episode(503)], next_offset: null, truncated: true });

    const { result } = renderHook(() => useShowEpisodes(SHOW));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isTruncated).toBe(false);
    await act(() => result.current.loadMore());
    expect(result.current.isTruncated).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });
});
