// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequestGate, type Priority } from './concurrency';
import { IndexerAbortedError } from './indexer.errors';
import { settle } from './runtime.fixtures';

/** A gate whose calls each wait for `finish`, logging when they start. */
function gated(limit: number) {
  const gate = createRequestGate(limit);
  const started: string[] = [];
  const pending = new Map<string, () => void>();
  const ask = (key: string, priority: Priority, name: string, signal?: AbortSignal) =>
    gate.run(
      key,
      priority,
      () =>
        new Promise<string>((resolve) => {
          started.push(name);
          pending.set(name, () => resolve(name));
        }),
      signal,
    );
  const finish = async (name: string) => {
    pending.get(name)?.();
    pending.delete(name);
    await settle();
  };
  return { ask, started, finish };
}

describe('createRequestGate', () => {
  it('runs at most the limit per key at once, each key on its own', async () => {
    const { ask, started, finish } = gated(2);
    const calls = ['a1', 'a2', 'a3'].map((name) => ask('a', 'foreground', name));
    void ask('b', 'foreground', 'b1');
    await settle();
    expect(started).toEqual(['a1', 'a2', 'b1']);

    await finish('a1');
    expect(started).toEqual(['a1', 'a2', 'b1', 'a3']);
    await finish('a2');
    await finish('a3');
    expect(await Promise.all(calls)).toEqual(['a1', 'a2', 'a3']);
  });

  it('starts foreground calls first, and background ones only while none waits, leaving one slot free', async () => {
    const { ask, started, finish } = gated(3);
    for (const name of ['bg1', 'bg2', 'bg3']) void ask('a', 'background', name);
    await settle();
    expect(started).toEqual(['bg1', 'bg2']);

    for (const name of ['fg1', 'fg2']) void ask('a', 'foreground', name);
    await settle();
    // One starts in the slot the background left free; the other gets the next slot, ahead of bg3.
    expect(started).toEqual(['bg1', 'bg2', 'fg1']);
    await finish('bg1');
    expect(started).toEqual(['bg1', 'bg2', 'fg1', 'fg2']);

    await finish('fg1');
    expect(started).toHaveLength(4);
    await finish('fg2');
    expect(started).toEqual(['bg1', 'bg2', 'fg1', 'fg2', 'bg3']);
  });

  it('runs one background call at a time with a limit of one', async () => {
    const { ask, started, finish } = gated(1);
    void ask('a', 'background', 'bg1');
    void ask('a', 'background', 'bg2');
    await settle();
    expect(started).toEqual(['bg1']);
    await finish('bg1');
    expect(started).toEqual(['bg1', 'bg2']);
  });

  it('drops a waiting call whose signal fires, and never interrupts one that started', async () => {
    const { ask, started, finish } = gated(1);
    const controller = new AbortController();
    const first = ask('a', 'foreground', 'first', controller.signal);
    const second = ask('a', 'foreground', 'second', controller.signal);
    const third = ask('a', 'foreground', 'third');
    await settle();

    controller.abort();
    await expect(second).rejects.toBeInstanceOf(IndexerAbortedError);
    await finish('first');
    expect(await first).toBe('first');
    expect(started).toEqual(['first', 'third']);
    await finish('third');
    expect(await third).toBe('third');
  });

  it('rejects at once when the signal fired before the call', async () => {
    const { ask, started } = gated(1);
    const controller = new AbortController();
    controller.abort();
    await expect(ask('a', 'foreground', 'late', controller.signal)).rejects.toBeInstanceOf(IndexerAbortedError);
    expect(started).toEqual([]);
  });
});
