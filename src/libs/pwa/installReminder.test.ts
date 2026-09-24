import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeatureDiscoveryStorageKey } from '@/config/featureDiscovery';
import { PWA_INSTALL_REMINDER_DELAYS_MS, PWA_INSTALL_STORAGE_ID } from '@/config/pwa';
import {
  isInstallReminderDue,
  markInstallReminderDone,
  resetInstallReminderMemory,
  snoozeInstallReminder,
  subscribeToInstallReminderDismissal,
} from './installReminder';

const PUBKY = 'alice';
const KEY = buildFeatureDiscoveryStorageKey(PUBKY, PWA_INSTALL_STORAGE_ID);
const NOW = new Date('2026-09-15T12:00:00Z').getTime();

function readStored() {
  return JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as {
    done: boolean;
    laterCount: number;
    nextShowAt: number;
  } | null;
}

describe('installReminder', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetInstallReminderMemory();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is due for a user with no stored state', () => {
    expect(isInstallReminderDue(PUBKY)).toBe(true);
  });

  it('is never due again once marked done', () => {
    markInstallReminderDone(PUBKY);

    expect(readStored()).toEqual({ done: true, laterCount: 0, nextShowAt: 0 });
    expect(isInstallReminderDue(PUBKY)).toBe(false);

    snoozeInstallReminder(PUBKY);
    expect(readStored()?.done).toBe(true);
  });

  it('snoozes with the escalating schedule and repeats the last delay', () => {
    snoozeInstallReminder(PUBKY);
    expect(readStored()).toEqual({ done: false, laterCount: 1, nextShowAt: NOW + PWA_INSTALL_REMINDER_DELAYS_MS[0] });
    expect(isInstallReminderDue(PUBKY)).toBe(false);

    vi.setSystemTime(NOW + PWA_INSTALL_REMINDER_DELAYS_MS[0]);
    expect(isInstallReminderDue(PUBKY)).toBe(true);

    snoozeInstallReminder(PUBKY);
    snoozeInstallReminder(PUBKY);
    snoozeInstallReminder(PUBKY);
    const last = PWA_INSTALL_REMINDER_DELAYS_MS[PWA_INSTALL_REMINDER_DELAYS_MS.length - 1];
    expect(readStored()?.laterCount).toBe(PWA_INSTALL_REMINDER_DELAYS_MS.length - 1);
    expect(readStored()?.nextShowAt).toBe(NOW + PWA_INSTALL_REMINDER_DELAYS_MS[0] + last);
  });

  it('keeps users apart', () => {
    markInstallReminderDone(PUBKY);
    expect(isInstallReminderDue('bob')).toBe(true);
  });

  it('ignores malformed stored state', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(isInstallReminderDue(PUBKY)).toBe(true);

    window.localStorage.setItem(KEY, JSON.stringify({ done: 'yes' }));
    expect(isInstallReminderDue(PUBKY)).toBe(true);
  });

  it('is not due when storage cannot be read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isInstallReminderDue(PUBKY)).toBe(false);
    getItem.mockRestore();
  });

  it('does not overwrite a stored dismissal when the read fails during a snooze', () => {
    markInstallReminderDone(PUBKY);
    const onDismiss = vi.fn();
    subscribeToInstallReminderDismissal(PUBKY, onDismiss);
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    snoozeInstallReminder(PUBKY);
    getItem.mockRestore();

    expect(readStored()?.done).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps a dismissal for the session when storage cannot be written', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    snoozeInstallReminder(PUBKY);
    setItem.mockRestore();

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(isInstallReminderDue(PUBKY)).toBe(false);
  });

  it('still dismisses mounted banners when storage cannot be written', () => {
    const onDismiss = vi.fn();
    subscribeToInstallReminderDismissal(PUBKY, onDismiss);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    markInstallReminderDone(PUBKY);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it('notifies subscribers for the same user only, and stops after unsubscribe', () => {
    const onAlice = vi.fn();
    const onBob = vi.fn();
    const unsubscribeAlice = subscribeToInstallReminderDismissal(PUBKY, onAlice);
    subscribeToInstallReminderDismissal('bob', onBob);

    snoozeInstallReminder(PUBKY);
    expect(onAlice).toHaveBeenCalledTimes(1);
    expect(onBob).not.toHaveBeenCalled();

    unsubscribeAlice();
    snoozeInstallReminder(PUBKY);
    expect(onAlice).toHaveBeenCalledTimes(1);
  });

  it('dismisses when another tab writes a snooze or clears storage', () => {
    const onDismiss = vi.fn();
    subscribeToInstallReminderDismissal(PUBKY, onDismiss);

    window.localStorage.setItem(KEY, JSON.stringify({ done: true, laterCount: 0, nextShowAt: 0 }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // A cleared store makes the reminder due again, so a null-key event must not dismiss.
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
