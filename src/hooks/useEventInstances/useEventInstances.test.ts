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

  it('keeps a read in flight when more rows come: its rows are not read a second time', async () => {
    const finish: ((value: TEventInstance[]) => void)[] = [];
    mocks.fetchEventInstances.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
      initialProps: { cards: ROWS.slice(0, 2) },
    });

    rerender({ cards: ROWS.slice(0, 4) });

    expect(mocks.fetchEventInstances).toHaveBeenCalledTimes(2);
    expect(mocks.fetchEventInstances.mock.calls[1][0].cards).toEqual(ROWS.slice(2, 4));
    // The first read still counts when it answers
    await act(async () => finish[0](withDetails(ROWS.slice(0, 2))));
    expect(result.current.instances).toHaveLength(2);
    await act(async () => finish[1](withDetails(ROWS.slice(2, 4))));
    expect(result.current.instances).toHaveLength(4);
  });

  describe('a row that comes again with the same id and other contents (the search read again)', () => {
    const HOLIDAY = ROWS[0];
    const CONCERT = ROWS[1];
    const UNCHANGED = ROWS[3];
    const MOVED: TPinakesCard = {
      ...CONCERT,
      name: 'Annett Louisan @ Kaufleuten',
      start: '2026-11-17T19:00:00Z',
      end: '2026-11-17T23:00:00Z',
      point: { lat: 47.3712, lon: 8.5363 },
    };
    const CANCELLED: TPinakesCard = { ...HOLIDAY, occurrence: { ...HOLIDAY.occurrence!, status: 'cancelled' } };

    it('shows the new start, point, name and status instead of the ones it read before', async () => {
      const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
        initialProps: { cards: [HOLIDAY, CONCERT, UNCHANGED] },
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.instances[0].event_status).toBe('scheduled');
      expect(result.current.instances[1]).toMatchObject({ start: CONCERT.start, point: CONCERT.point });

      // The same three ids (and the occurrence's same instance): two rows say something else now
      rerender({ cards: [CANCELLED, MOVED, UNCHANGED] });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.instances.map((instance) => instance.id)).toEqual([HOLIDAY.id, CONCERT.id, UNCHANGED.id]);
      expect(result.current.instances[0].event_status).toBe('cancelled');
      expect(result.current.instances[1]).toMatchObject({
        name: MOVED.name,
        start: MOVED.start,
        end: MOVED.end,
        point: MOVED.point,
        // Its details are read again for the row as it is now
        tz: 'Europe/Zurich',
      });
      // Only the rows that changed are read again
      expect(mocks.fetchEventInstances).toHaveBeenCalledTimes(2);
      expect(mocks.fetchEventInstances.mock.calls[1][0].cards).toEqual([CANCELLED, MOVED]);
    });

    it('never shows what it read before while the changed row is read', async () => {
      const finish: ((value: TEventInstance[]) => void)[] = [];
      const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
        initialProps: { cards: [CONCERT] },
      });
      await waitFor(() => expect(result.current.instances).toHaveLength(1));
      mocks.fetchEventInstances.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));

      rerender({ cards: [MOVED] });

      expect(result.current).toEqual({ instances: [], isLoading: true });
      await act(async () => finish[0](withDetails([MOVED])));
      expect(result.current.instances).toEqual(withDetails([MOVED]));
    });

    it.each([
      ['the old answer last', [1, 0]],
      ['the old answer first', [0, 1]],
    ])('keeps the changed row’s own answer when the answers come out of order (%s)', async (_name, order) => {
      const finish: ((value: TEventInstance[]) => void)[] = [];
      mocks.fetchEventInstances.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
      const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
        initialProps: { cards: [CONCERT] },
      });
      rerender({ cards: [MOVED] });
      expect(mocks.fetchEventInstances).toHaveBeenCalledTimes(2);
      // What each read answers: the row it was asked for, with the details of that time
      const answers = [
        [{ ...CONCERT, tz: 'Europe/Zurich', event_status: 'scheduled' }],
        [{ ...MOVED, tz: 'Europe/Berlin', event_status: 'rescheduled' }],
      ];

      await act(async () => finish[order[0]](answers[order[0]]));
      // The old answer alone is not the row's: the list waits for its own
      if (order[0] === 0) expect(result.current).toEqual({ instances: [], isLoading: true });
      await act(async () => finish[order[1]](answers[order[1]]));

      expect(result.current).toEqual({ instances: answers[1], isLoading: false });
    });
  });

  describe('a list the search replaces (another search, or the same one read again)', () => {
    const LIST = ROWS.slice(0, 2);
    const NONE: TPinakesCard[] = [];

    it('reads the rows again when they come back: what it held was read for the list before', async () => {
      const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
        initialProps: { cards: LIST },
      });
      await waitFor(() => expect(result.current.instances).toHaveLength(2));

      rerender({ cards: NONE });
      rerender({ cards: LIST });

      // Not the events held from before: they wait for the new list's own read
      expect(result.current).toEqual({ instances: [], isLoading: true });
      await waitFor(() => expect(result.current.instances).toHaveLength(2));
      expect(mocks.fetchEventInstances).toHaveBeenCalledTimes(2);
      expect(mocks.fetchEventInstances.mock.calls[1][0].cards).toEqual(LIST);
    });

    it.each([
      ['the earlier list’s answer last', [1, 0]],
      ['the earlier list’s answer first', [0, 1]],
    ])('shows only the answer asked for the list it has now (%s)', async (_name, order) => {
      const finish: ((value: TEventInstance[]) => void)[] = [];
      mocks.fetchEventInstances.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
      const { result, rerender } = renderHook(({ cards }) => useEventInstances(cards), {
        initialProps: { cards: LIST },
      });
      rerender({ cards: NONE });
      rerender({ cards: LIST });
      expect(mocks.fetchEventInstances).toHaveBeenCalledTimes(2);
      // The same rows both times; the details are what Pinakes said at each read
      const answers = ['cancelled', 'postponed'].map((status) =>
        LIST.map((card): TEventInstance => ({ ...card, event_status: status })),
      );

      await act(async () => finish[order[0]](answers[order[0]]));
      if (order[0] === 0) expect(result.current).toEqual({ instances: [], isLoading: true });
      await act(async () => finish[order[1]](answers[order[1]]));

      expect(result.current).toEqual({ instances: answers[1], isLoading: false });
    });
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
