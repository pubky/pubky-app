import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vibesReminder } from './vibesReminder';

// The persisted key, independent of the implementation constants.
const KEY = 'pubky-feature-discovery:alice:vibes-alert-v2';
const hour = 60 * 60 * 1000;

describe('vibesReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    vibesReminder.resetMemory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows the 24h, 72h and repeating weekly schedule under the Vibes key', () => {
    for (const hours of [24, 72, 168, 168]) {
      expect(vibesReminder.isDue('alice')).toBe(true);
      const nextShowAt = Date.now() + hours * hour;
      vibesReminder.snooze('alice');
      expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ done: false, nextShowAt });
      vi.setSystemTime(nextShowAt);
    }
  });

  it('retires the alert under the Vibes key', () => {
    vibesReminder.markDone('alice');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ done: true });
    expect(vibesReminder.isDue('alice')).toBe(false);
  });
});
