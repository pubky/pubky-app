import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyedSlots } from './keyed-slots';

afterEach(() => vi.useRealTimers());

describe('KeyedSlots', () => {
  it('gives each key its own slots and a waiting holder the next free one', async () => {
    const slots = new KeyedSlots(2);
    const first = await slots.acquire('a.example', 1_000);
    const second = await slots.acquire('a.example', 1_000);
    expect(await slots.acquire('b.example', 0)).not.toBeNull();

    const third = slots.acquire('a.example', 1_000);
    first?.();
    expect(await third).not.toBeNull();
    second?.();
  });

  it('gives no slot after the wait when the key stays full', async () => {
    vi.useFakeTimers();
    const slots = new KeyedSlots(1);
    await slots.acquire('slow.example', 0);
    const waiting = slots.acquire('slow.example', 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(waiting).resolves.toBeNull();
  });

  it('frees a slot once, however often it is given back', async () => {
    const slots = new KeyedSlots(1);
    const release = await slots.acquire('a.example', 0);
    release?.();
    release?.();
    const again = await slots.acquire('a.example', 0);
    expect(again).not.toBeNull();
    expect(await slots.acquire('a.example', 0)).toBeNull();
  });

  it('drops a waiter whose read gave up, so a freed slot is never handed to it', async () => {
    const slots = new KeyedSlots(1);
    const holder = await slots.acquire('i.scdn.co', 0);
    const controller = new AbortController();
    const waiting = slots.acquire('i.scdn.co', 10_000, controller.signal);

    controller.abort();
    await expect(waiting).resolves.toBeNull();
    holder?.();

    expect(slots.holders('i.scdn.co')).toBe(0);
    const next = await slots.acquire('i.scdn.co', 0);
    expect(next).not.toBeNull();
    next?.();
    expect(slots.holders('i.scdn.co')).toBe(0);
  });

  it('gives no slot to a read that already gave up', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new KeyedSlots(1).acquire('a.example', 1_000, controller.signal)).resolves.toBeNull();
  });
});
