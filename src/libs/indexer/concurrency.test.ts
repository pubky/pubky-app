// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequestGate, type Priority, sleep } from './concurrency';
import { IndexerAbortedError, RateLimitedError } from './indexer.errors';
import { fakeTime, settle } from './runtime.fixtures';

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

  describe('after a 429', () => {
    /** A gate on fake time whose calls each answer `refuse` or `succeed` when told, logging when they start. */
    function paced(limit: number) {
      const time = fakeTime(0);
      const gate = createRequestGate(limit, {
        now: () => time.clock.now,
        sleep: (ms) => sleep(ms, undefined, time.schedule),
      });
      const started: Array<[string, number]> = [];
      const answers = new Map<string, (refused: boolean, retryAfterMs?: number) => void>();
      const ask = (route: string, name: string) =>
        gate
          .run(
            'hs',
            'foreground',
            () =>
              new Promise<string>((resolve, reject) => {
                started.push([name, time.clock.now]);
                answers.set(name, (refused, retryAfterMs) =>
                  refused ? reject(new RateLimitedError('hs', retryAfterMs)) : resolve(name),
                );
              }),
            undefined,
            route,
          )
          .catch(() => 'refused');
      const answer = async (name: string, refused: boolean, retryAfterMs?: number) => {
        answers.get(name)?.(refused, retryAfterMs);
        await settle();
      };
      return { time, ask, started, answer };
    }

    it('closes the route for every call until the named wait, then starts them one per gap, other routes free', async () => {
      const { time, ask, started, answer } = paced(6);
      void ask('stream', 's1');
      await settle();
      await answer('s1', true, 500);
      for (const name of ['s2', 's3', 's4']) void ask('stream', name);
      void ask('file', 'f1');
      await settle();
      expect(started).toEqual([
        ['s1', 0],
        ['f1', 0],
      ]);

      await time.advance(5000);
      // The first once the named wait is over, each next one a gap of 1 s later.
      expect(started.slice(2)).toEqual([
        ['s2', 500],
        ['s3', 1500],
        ['s4', 2500],
      ]);
    });

    it('counts the refusals of calls in flight together once, and doubles the gap per refusal after that', async () => {
      const { time, ask, started, answer } = paced(6);
      void ask('stream', 's1');
      void ask('stream', 's2');
      await settle();
      await answer('s1', true);
      await answer('s2', true);
      void ask('stream', 's3');
      void ask('stream', 's4');
      await time.advance(1000);
      expect(started.slice(2)).toEqual([['s3', 1000]]);

      // Started after the last refusal: a new one, so the gap doubles.
      await answer('s3', true);
      void ask('stream', 's5');
      await time.advance(10 * 1000);
      expect(started.slice(3)).toEqual([
        ['s4', 3000],
        ['s5', 5000],
      ]);
    });

    it('ends the pace a minute after the last refusal', async () => {
      const { time, ask, started, answer } = paced(6);
      void ask('stream', 's1');
      await settle();
      await answer('s1', true);
      await time.advance(60 * 1000);
      for (const name of ['s2', 's3', 's4']) void ask('stream', name);
      await settle();
      expect(started.slice(1).map(([name]) => name)).toEqual(['s2', 's3', 's4']);
      expect(started.slice(1).every(([, at]) => at === 60 * 1000)).toBe(true);
    });
  });
});
