import Dexie from 'dexie';
import { describe, expect, it, vi } from 'vitest';

// Exercise the installed dependency so removing/updating its patch cannot
// silently bring back PUBKY-APP-JT/JS's recursive event dispatch.
describe('Dexie default event dispatch', () => {
  it('delivers a large subscriber set without consuming one stack frame per listener', () => {
    const event = Dexie.Events().addEventType('mutation');
    let calls = 0;
    for (let index = 0; index < 30_000; index++) {
      event.subscribe(() => {
        calls++;
      });
    }

    event.fire({});
    expect(calls).toBe(30_000);
  });

  it('keeps stack depth constant across the listener set', () => {
    const originalStackTraceLimit = Error.stackTraceLimit;
    try {
      // Worker pools can have enough stack to pass the large-listener test unpatched.
      // Capture complete stacks so this guard does not depend on the overflow limit.
      Error.stackTraceLimit = Infinity;
      const event = Dexie.Events().addEventType('mutation');
      const depths: number[] = [];
      const captureDepth = () => {
        const trace = { stack: '' };
        Error.captureStackTrace(trace, captureDepth);
        depths.push(trace.stack.split('\n').length);
      };
      event.subscribe(() => {
        captureDepth();
      });
      let calls = 0;
      for (let index = 0; index < 128; index++) {
        event.subscribe(() => {
          calls++;
        });
      }
      event.subscribe(() => {
        captureDepth();
      });

      event.fire({});
      expect(calls).toBe(128);
      expect(depths).toHaveLength(2);
      expect(depths[0]).toBeGreaterThan(1);
      expect(depths[1]).toBe(depths[0]);
    } finally {
      Error.stackTraceLimit = originalStackTraceLimit;
    }
  });

  it('preserves reverse order, callback context, arguments, and the oldest result', () => {
    const context = { marker: 'event-context' };
    const event = Dexie.Events().addEventType('mutation');
    const calls: string[] = [];
    const first = vi.fn(function (this: typeof context, value: string) {
      expect(this).toBe(context);
      calls.push(`first:${value}`);
      return 'result';
    });
    event.subscribe(first);
    event.subscribe((value: string) => {
      calls.push(`last:${value}`);
      return 0;
    });
    expect(event.fire.call(context, 'change')).toBe('result');
    expect(calls).toEqual(['last:change', 'first:change']);
  });

  it('stops only on false and keeps duplicate subscription/unsubscription behavior', () => {
    const event = Dexie.Events().addEventType('mutation');
    const first = vi.fn();
    const stop = vi.fn(() => false);
    const last = vi.fn();
    event.subscribe(first);
    event.subscribe(stop);
    event.subscribe(last);
    event.subscribe(last);
    expect(event.fire()).toBe(false);
    expect(last).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    event.unsubscribe(stop);
    event.fire();
    expect(last).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('retains the in-progress listener set when a callback changes subscriptions', () => {
    const event = Dexie.Events().addEventType('mutation');
    const calls: string[] = [];
    const first = () => {
      calls.push('first');
    };
    const added = () => {
      calls.push('added');
    };
    const last = () => {
      calls.push('last');
      event.unsubscribe(first);
      event.subscribe(added);
    };
    event.subscribe(first);
    event.subscribe(last);
    event.fire();
    expect(calls).toEqual(['last', 'first']);
    calls.length = 0;
    event.fire();
    expect(calls).toEqual(['added', 'last']);
  });

  it('keeps custom event chains unchanged', () => {
    const event = Dexie.Events().addEventType(
      'map',
      (first, second) => (value: number) => second(first(value)),
      (value: number) => value,
    );
    event.subscribe((value: number) => value + 1);
    event.subscribe((value: number) => value * 2);
    expect(event.fire(3)).toBe(8);
  });
});
