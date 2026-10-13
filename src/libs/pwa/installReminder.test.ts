import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWA_INSTALL_REMINDER_DELAYS_MS } from '@/config/pwa';
import { installReminder } from './installReminder';

// The persisted key and format already in users' browsers, independent of the implementation constants.
const KEY = 'pubky-feature-discovery:alice:install-prompt-v1';
const NOW = new Date('2026-09-15T12:00:00Z').getTime();

describe('installReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    installReminder.resetMemory();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('snoozes under the install key with the PWA schedule', () => {
    installReminder.snooze('alice');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      done: false,
      laterCount: 1,
      nextShowAt: NOW + PWA_INSTALL_REMINDER_DELAYS_MS[0],
    });
  });

  it('retires the banner under the install key', () => {
    installReminder.markDone('alice');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ done: true, laterCount: 0, nextShowAt: 0 });
    expect(installReminder.isDue('alice')).toBe(false);
  });

  it.each([
    ['a permanent dismissal', { done: true, laterCount: 0, nextShowAt: 0 }, false],
    ['a running snooze', { done: false, laterCount: 1, nextShowAt: NOW + 60_000 }, false],
    ['an expired snooze', { done: false, laterCount: 1, nextShowAt: NOW - 1 }, true],
  ])('honors %s saved before the shared reminder', (_label, saved, due) => {
    localStorage.setItem(KEY, JSON.stringify(saved));
    expect(installReminder.isDue('alice')).toBe(due);
  });
});
