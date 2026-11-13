import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type TEventInstance, toEventInstance } from '@/pipes/resource/resource.events';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { useEventInstances } from './useEventInstances';

const mocks = vi.hoisted(() => ({ fetchEventInstances: vi.fn() }));

vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: { fetchEventInstances: mocks.fetchEventInstances },
}));

const ROWS: TPinakesCard[] = eventsFixture.items;
/** What the controller answers: each row with a time zone read for it (an occurrence has none). */
const withDetails = (cards: readonly TPinakesCard[]): TEventInstance[] =>
  cards.map((card) => (card.occurrence ? toEventInstance(card, null) : { ...card, tz: 'Europe/Zurich' }));

describe('useEventInstances', () => {
  beforeEach(() => {
    mocks.fetchEventInstances
      .mockReset()
      .mockImplementation(async ({ cards }: { cards: TPinakesCard[] }) => withDetails(cards));
  });

  it('gives one event per row, in the rows’ order, once their details are read', async () => {
    const { result } = renderHook(() => useEventInstances(ROWS));

    expect(result.current).toEqual({ instances: [], isLoading: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.instances.map((instance) => instance.name)).toEqual(ROWS.map((card) => card.name));
    // The three holidays of one calendar are three events
    expect(result.current.instances.filter((instance) => instance.occurrence)).toHaveLength(3);
    expect(result.current.instances.find((instance) => !instance.occurrence)?.tz).toBe('Europe/Zurich');
  });

  it('reads only the next page’s rows when more come, and keeps showing the ones it has', async () => {
    const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
      initialProps: { cards: ROWS.slice(0, 2) },
    });
    await waitFor(() => expect(result.current.instances).toHaveLength(2));

    rerender({ cards: ROWS });
    expect(result.current.instances).toHaveLength(2);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.instances).toHaveLength(ROWS.length));

    expect(mocks.fetchEventInstances).toHaveBeenCalledTimes(2);
    expect(mocks.fetchEventInstances.mock.calls[1][0].cards).toEqual(ROWS.slice(2));
    expect(result.current.isLoading).toBe(false);
  });

  it('shows the rows as the search gave them when their details cannot be read', async () => {
    mocks.fetchEventInstances.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => useEventInstances(ROWS.slice(0, 2)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.instances.map((instance) => instance.name)).toEqual(
      ROWS.slice(0, 2).map((card) => card.name),
    );
    // An occurrence keeps its own lifecycle either way
    expect(result.current.instances[0].event_status).toBe('scheduled');
  });

  it('reads nothing without rows, and never shows the rows of a search it no longer has', async () => {
    const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
      initialProps: { cards: [] as TPinakesCard[] },
    });
    expect(result.current).toEqual({ instances: [], isLoading: false });
    expect(mocks.fetchEventInstances).not.toHaveBeenCalled();

    rerender({ cards: ROWS.slice(0, 1) });
    await waitFor(() => expect(result.current.instances).toHaveLength(1));
    await act(async () => rerender({ cards: ROWS.slice(1, 2) }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.instances.map((instance) => instance.name)).toEqual([ROWS[1].name]);
  });
});
