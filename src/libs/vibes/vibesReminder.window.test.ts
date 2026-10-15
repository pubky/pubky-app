import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vibesReminder } from './vibesReminder';

describe('vibesReminder campaign window', () => {
  beforeEach(() => {
    localStorage.clear();
    vibesReminder.resetMemory();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['before the window', '2026-10-22T07:59:59.999Z', false],
    ['at the start', '2026-10-22T08:00:00Z', true],
    ['inside the window', '2026-10-29T12:00:00Z', true],
    ['just before the end', '2026-11-05T07:59:59.999Z', true],
    ['at the end', '2026-11-05T08:00:00Z', false],
    ['after the window', '2026-12-01T00:00:00Z', false],
  ])('is due %s (%s) only inside 22 Oct 08:00 UTC to 5 Nov 08:00 UTC', (_label, now, due) => {
    vi.setSystemTime(new Date(now));
    expect(vibesReminder.isDue('alice')).toBe(due);
  });
});
