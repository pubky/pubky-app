import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isReminderDue, markTried, remindLater, subscribeToDismissal } from './vibesReminder';

// These are the existing persisted keys, independent of the implementation constants.
const aliceKey = 'pubky-feature-discovery:alice:vibes-alert-v1';
const bobKey = 'pubky-feature-discovery:bob:vibes-alert-v1';
const hour = 60 * 60 * 1000;

describe('vibesReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is due on the first visit without writing to storage', () => {
    expect(isReminderDue('alice')).toBe(true);
    expect(localStorage.getItem(aliceKey)).toBeNull();
  });

  it('persists the 24h, 72h and repeating weekly schedule', () => {
    for (const hours of [24, 72, 168, 168, 168]) {
      expect(isReminderDue('alice')).toBe(true);
      const nextShowAt = Date.now() + hours * hour;
      remindLater('alice');
      expect(JSON.parse(localStorage.getItem(aliceKey)!)).toMatchObject({ tried: false, nextShowAt });
      vi.setSystemTime(nextShowAt - 1);
      expect(isReminderDue('alice')).toBe(false);
      vi.setSystemTime(nextShowAt);
      expect(isReminderDue('alice')).toBe(true);
    }
  });

  it('honors existing saved choices and keeps accounts separate', () => {
    localStorage.setItem(aliceKey, JSON.stringify({ tried: true, laterCount: 2, nextShowAt: 0 }));
    localStorage.setItem(bobKey, JSON.stringify({ tried: false, laterCount: 1, nextShowAt: Date.now() }));
    expect(isReminderDue('alice')).toBe(false);
    expect(isReminderDue('bob')).toBe(true);
    remindLater('bob');
    expect(JSON.parse(localStorage.getItem(bobKey)!)).toMatchObject({ nextShowAt: Date.now() + 72 * hour });
    expect(JSON.parse(localStorage.getItem(aliceKey)!)).toMatchObject({ tried: true });
  });

  it('permanently dismisses while snoozed and cannot be undone by Later', () => {
    remindLater('alice');
    markTried('alice');
    const saved = localStorage.getItem(aliceKey);
    expect(JSON.parse(saved!)).toMatchObject({ tried: true });
    vi.setSystemTime(Date.now() + 365 * 24 * hour);
    remindLater('alice');
    markTried('alice');
    expect(isReminderDue('alice')).toBe(false);
    expect(localStorage.getItem(aliceKey)).toBe(saved);
  });

  it('re-reads storage so a stale Later action cannot shorten a snooze or undo Try', () => {
    expect(isReminderDue('alice')).toBe(true);
    const snooze = { tried: false, laterCount: 2, nextShowAt: Date.now() + 72 * hour };
    localStorage.setItem(aliceKey, JSON.stringify(snooze));
    remindLater('alice');
    expect(JSON.parse(localStorage.getItem(aliceKey)!)).toEqual(snooze);
    localStorage.setItem(aliceKey, JSON.stringify({ ...snooze, tried: true }));
    remindLater('alice');
    expect(JSON.parse(localStorage.getItem(aliceKey)!)).toEqual({ ...snooze, tried: true });
  });

  it('keeps Try permanent when another tab writes Later after reading the old reminder', () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce((key, value) => {
      // The other tab selects Try between Later's read and write.
      markTried('alice');
      setItem.call(localStorage, key, value);
    });

    remindLater('alice');
    vi.setSystemTime(Date.now() + 365 * 24 * hour);
    expect(isReminderDue('alice')).toBe(false);
    expect(isReminderDue('bob')).toBe(true);
  });

  it.each([
    '{broken',
    'null',
    '{"tried":false,"laterCount":-1,"nextShowAt":0}',
    '{"tried":"false","laterCount":0,"nextShowAt":0}',
    '{"tried":false,"laterCount":0.5,"nextShowAt":0}',
    '{"tried":false,"laterCount":0,"nextShowAt":-1}',
  ])('recovers from invalid saved data: %s', (raw) => {
    localStorage.setItem(aliceKey, raw);
    expect(isReminderDue('alice')).toBe(true);
    remindLater('alice');
    expect(JSON.parse(localStorage.getItem(aliceKey)!)).toEqual({
      tried: false,
      laterCount: 1,
      nextShowAt: Date.now() + 24 * hour,
    });
  });

  it('stays on weekly reminders when saved laterCount exceeds the schedule', () => {
    localStorage.setItem(aliceKey, JSON.stringify({ tried: false, laterCount: 100, nextShowAt: 0 }));
    remindLater('alice');
    expect(JSON.parse(localStorage.getItem(aliceKey)!)).toMatchObject({ nextShowAt: Date.now() + 168 * hour });
  });

  it('notifies all same-account subscribers and releases them on unsubscribe', () => {
    const first = vi.fn();
    const second = vi.fn();
    const otherAccount = vi.fn();
    const unsubscribe = [
      subscribeToDismissal('alice', first),
      subscribeToDismissal('alice', second),
      subscribeToDismissal('bob', otherAccount),
    ];
    try {
      remindLater('alice');
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
      expect(otherAccount).not.toHaveBeenCalled();
      unsubscribe[0]();
      markTried('alice');
      window.dispatchEvent(new StorageEvent('storage', { key: aliceKey }));
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledTimes(3);
    } finally {
      unsubscribe.forEach((stop) => stop());
    }
  });

  it('notifies on cross-tab dismissal but ignores unrelated or eligible storage changes', () => {
    const onDismiss = vi.fn();
    const unsubscribe = subscribeToDismissal('alice', onDismiss);
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: bobKey }));
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(onDismiss).not.toHaveBeenCalled();
      localStorage.setItem(aliceKey, JSON.stringify({ tried: true, laterCount: 0, nextShowAt: 0 }));
      window.dispatchEvent(new StorageEvent('storage', { key: aliceKey }));
      expect(onDismiss).toHaveBeenCalledOnce();
      localStorage.removeItem(aliceKey);
      window.dispatchEvent(new StorageEvent('storage', { key: aliceKey }));
      expect(onDismiss).toHaveBeenCalledOnce();
      localStorage.setItem(`${bobKey}:tried`, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: `${bobKey}:tried` }));
      expect(onDismiss).toHaveBeenCalledOnce();
      localStorage.setItem(`${aliceKey}:tried`, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: `${aliceKey}:tried` }));
      expect(onDismiss).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  it.each(['getItem', 'setItem'] as const)('still notifies dismissal when %s fails', (method) => {
    const onDismiss = vi.fn();
    const unsubscribe = subscribeToDismissal('alice', onDismiss);
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('Storage unavailable');
    });
    try {
      if (method === 'getItem') expect(isReminderDue('alice')).toBe(false);
      expect(() => markTried('alice')).not.toThrow();
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(() => remindLater('alice')).not.toThrow();
      expect(onDismiss).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });
});
