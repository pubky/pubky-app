import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeatureReminder } from './featureReminder';

const hour = 60 * 60 * 1000;
const DELAYS = [1 * hour, 2 * hour, 5 * hour];
const reminder = createFeatureReminder('test-prompt-v1', DELAYS);
const aliceKey = 'pubky-feature-discovery:alice:test-prompt-v1';
const bobKey = 'pubky-feature-discovery:bob:test-prompt-v1';

function readStored(key = aliceKey) {
  return JSON.parse(localStorage.getItem(key) ?? 'null') as {
    done: boolean;
    laterCount: number;
    nextShowAt: number;
  } | null;
}

describe('createFeatureReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    reminder.resetMemory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is due on the first visit without writing to storage', () => {
    expect(reminder.isDue('alice')).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('snoozes with the escalating schedule and repeats the last delay', () => {
    for (const delay of [...DELAYS, DELAYS[2], DELAYS[2]]) {
      expect(reminder.isDue('alice')).toBe(true);
      const nextShowAt = Date.now() + delay;
      reminder.snooze('alice');
      expect(readStored()).toMatchObject({ done: false, nextShowAt });
      vi.setSystemTime(nextShowAt - 1);
      expect(reminder.isDue('alice')).toBe(false);
      vi.setSystemTime(nextShowAt);
    }
    expect(readStored()?.laterCount).toBe(DELAYS.length - 1);
  });

  it('stays on the last delay when a saved laterCount exceeds the schedule', () => {
    localStorage.setItem(aliceKey, JSON.stringify({ done: false, laterCount: 100, nextShowAt: 0 }));
    reminder.snooze('alice');
    expect(readStored()).toEqual({ done: false, laterCount: DELAYS.length - 1, nextShowAt: Date.now() + DELAYS[2] });
  });

  it('is never due again once marked done, and a later snooze cannot undo it', () => {
    reminder.snooze('alice');
    reminder.markDone('alice');
    expect(readStored()).toEqual({ done: true, laterCount: 0, nextShowAt: 0 });
    expect(localStorage.getItem(`${aliceKey}:done`)).toBe('true');

    vi.setSystemTime(Date.now() + 365 * 24 * hour);
    reminder.snooze('alice');
    expect(reminder.isDue('alice')).toBe(false);
    expect(readStored()?.done).toBe(true);
  });

  it('keeps done permanent when another tab writes a snooze after reading the old state', () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce((key, value) => {
      // The other tab marks done between the snooze's read and its write.
      reminder.markDone('alice');
      setItem.call(localStorage, key, value);
    });

    reminder.snooze('alice');
    expect(readStored()?.done).toBe(false);
    vi.setSystemTime(Date.now() + 365 * 24 * hour);
    expect(reminder.isDue('alice')).toBe(false);
  });

  it('re-reads storage so a stale prompt cannot extend a running snooze', () => {
    const snooze = { done: false, laterCount: 2, nextShowAt: Date.now() + 2 * hour };
    localStorage.setItem(aliceKey, JSON.stringify(snooze));
    const onDismiss = vi.fn();
    const unsubscribe = reminder.subscribeToDismissal('alice', onDismiss);

    reminder.snooze('alice');

    expect(readStored()).toEqual(snooze);
    expect(onDismiss).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('keeps users apart', () => {
    reminder.markDone('alice');
    localStorage.setItem(bobKey, JSON.stringify({ done: false, laterCount: 1, nextShowAt: Date.now() }));
    expect(reminder.isDue('alice')).toBe(false);
    expect(reminder.isDue('bob')).toBe(true);
    reminder.snooze('bob');
    expect(readStored(bobKey)).toEqual({ done: false, laterCount: 2, nextShowAt: Date.now() + DELAYS[1] });
  });

  it.each([
    '{broken',
    'null',
    '{"done":"yes","laterCount":0,"nextShowAt":0}',
    '{"done":false,"laterCount":-1,"nextShowAt":0}',
    '{"done":false,"laterCount":0.5,"nextShowAt":0}',
    '{"done":false,"laterCount":0,"nextShowAt":-1}',
  ])('recovers from invalid saved data: %s', (raw) => {
    localStorage.setItem(aliceKey, raw);
    expect(reminder.isDue('alice')).toBe(true);
    reminder.snooze('alice');
    expect(readStored()).toEqual({ done: false, laterCount: 1, nextShowAt: Date.now() + DELAYS[0] });
  });

  it('is not due when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable');
    });
    expect(reminder.isDue('alice')).toBe(false);
  });

  it('does not overwrite a stored dismissal when the read fails during a snooze', () => {
    reminder.markDone('alice');
    const onDismiss = vi.fn();
    const unsubscribe = reminder.subscribeToDismissal('alice', onDismiss);
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    reminder.snooze('alice');
    getItem.mockRestore();

    expect(setItem).not.toHaveBeenCalled();
    expect(readStored()?.done).toBe(true);
    expect(onDismiss).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it.each(['snooze', 'markDone'] as const)('keeps a %s for the session when storage cannot be written', (action) => {
    const onDismiss = vi.fn();
    const unsubscribe = reminder.subscribeToDismissal('alice', onDismiss);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded');
    });

    reminder[action]('alice');
    setItem.mockRestore();

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(localStorage.getItem(aliceKey)).toBeNull();
    // A re-check on the next focus must not resurrect the prompt.
    expect(reminder.isDue('alice')).toBe(false);
    reminder.resetMemory();
    expect(reminder.isDue('alice')).toBe(true);
    unsubscribe();
  });

  it('notifies every same-user subscriber and stops after unsubscribe', () => {
    const first = vi.fn();
    const second = vi.fn();
    const otherUser = vi.fn();
    const unsubscribeFirst = reminder.subscribeToDismissal('alice', first);
    const unsubscribeSecond = reminder.subscribeToDismissal('alice', second);
    const unsubscribeOther = reminder.subscribeToDismissal('bob', otherUser);

    reminder.snooze('alice');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(otherUser).not.toHaveBeenCalled();

    unsubscribeFirst();
    reminder.markDone('alice');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
    unsubscribeSecond();
    unsubscribeOther();
  });

  it('dismisses on another tab’s snooze or done write but ignores unrelated or eligible changes', () => {
    const onDismiss = vi.fn();
    const unsubscribe = reminder.subscribeToDismissal('alice', onDismiss);

    localStorage.setItem(bobKey, JSON.stringify({ done: true, laterCount: 0, nextShowAt: 0 }));
    window.dispatchEvent(new StorageEvent('storage', { key: bobKey }));
    // A cleared store makes the prompt due again, so a null-key event must not dismiss.
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(onDismiss).not.toHaveBeenCalled();

    localStorage.setItem(aliceKey, JSON.stringify({ done: false, laterCount: 1, nextShowAt: Date.now() + hour }));
    window.dispatchEvent(new StorageEvent('storage', { key: aliceKey }));
    expect(onDismiss).toHaveBeenCalledOnce();

    localStorage.clear();
    localStorage.setItem(`${aliceKey}:done`, 'true');
    window.dispatchEvent(new StorageEvent('storage', { key: `${aliceKey}:done` }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('lets another tab’s write replace a value this tab could not save', () => {
    const unsubscribe = reminder.subscribeToDismissal('alice', vi.fn());
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded');
    });
    reminder.snooze('alice');
    setItem.mockRestore();
    expect(reminder.isDue('alice')).toBe(false);

    localStorage.setItem(aliceKey, JSON.stringify({ done: false, laterCount: 1, nextShowAt: 0 }));
    window.dispatchEvent(new StorageEvent('storage', { key: aliceKey }));

    expect(reminder.isDue('alice')).toBe(true);
    unsubscribe();
  });

  it('keeps separate state per reminder', () => {
    const other = createFeatureReminder('other-prompt-v1', DELAYS);
    reminder.markDone('alice');
    expect(other.isDue('alice')).toBe(true);
  });
});
