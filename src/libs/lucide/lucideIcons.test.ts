import { describe, expect, it, vi } from 'vitest';
import {
  getLucideIconState,
  loadLucidePickerIcons,
  preloadLucideIcons,
  requestLucideIcon,
  subscribeToLucideIcons,
  toLucideIconName,
} from './lucideIcons';

describe('lucideIcons', () => {
  it('normalizes kebab-case icon names, including foreign ones', () => {
    expect(toLucideIconName('activity')).toBe('activity');
    expect(toLucideIconName('alarm-clock-check')).toBe('alarm-clock-check');
    // Another client's icon set — kept as a name so it round-trips; the
    // catalog answers `unknown` and the UI falls back.
    expect(toLucideIconName('not-a-real-lucide-icon')).toBe('not-a-real-lucide-icon');
  });

  it('normalizes case and surrounding whitespace instead of rejecting them', () => {
    // A client that stored `Activity` must still render the real glyph.
    expect(toLucideIconName('Activity')).toBe('activity');
    expect(toLucideIconName('Circle-Alert')).toBe('circle-alert');
    expect(toLucideIconName('  house  ')).toBe('house');
  });

  it('returns null for missing and malformed icon names', () => {
    expect(toLucideIconName(undefined)).toBeNull();
    expect(toLucideIconName(null)).toBeNull();
    expect(toLucideIconName('')).toBeNull();
    expect(toLucideIconName('Not An Icon')).toBeNull();
    expect(toLucideIconName('-leading-dash')).toBeNull();
    expect(toLucideIconName('double--dash')).toBeNull();
  });

  it('loads an icon into the store and serves a stable snapshot afterwards', async () => {
    expect(getLucideIconState('mountain')).toBeUndefined();

    requestLucideIcon('mountain');
    expect(getLucideIconState('mountain')).toEqual({ status: 'loading' });

    await vi.waitFor(() => {
      expect(getLucideIconState('mountain')?.status).toBe('loaded');
    });

    // Referentially stable snapshot — required by useSyncExternalStore.
    expect(getLucideIconState('mountain')).toBe(getLucideIconState('mountain'));
  });

  it('notifies subscribers when an icon resolves', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLucideIcons(listener);

    requestLucideIcon('anchor');

    await vi.waitFor(() => {
      expect(getLucideIconState('anchor')?.status).toBe('loaded');
    });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  it('answers unknown names as unknown without keeping per-name state', async () => {
    const name = 'not-a-real-lucide-icon' as Parameters<typeof requestLucideIcon>[0];
    requestLucideIcon(name);

    await vi.waitFor(() => {
      expect(getLucideIconState(name)).toEqual({ status: 'unknown' });
    });

    // Once the catalog is resident, further unknown names answer synchronously.
    expect(getLucideIconState('another-fake-icon' as Parameters<typeof getLucideIconState>[0])).toEqual({
      status: 'unknown',
    });
  });

  it('treats a repeated request for a loaded icon as a no-op', async () => {
    requestLucideIcon('wrench');
    await vi.waitFor(() => {
      expect(getLucideIconState('wrench')?.status).toBe('loaded');
    });
    const first = getLucideIconState('wrench');

    requestLucideIcon('wrench');

    expect(getLucideIconState('wrench')).toBe(first);
  });

  it('preloads normalizable names and silently skips the rest', async () => {
    expect(() => preloadLucideIcons(['Not An Icon', null, undefined, 'Library'])).not.toThrow();

    await vi.waitFor(() => {
      expect(getLucideIconState('library')?.status).toBe('loaded');
    });
  });

  it('lists canonical picker entries with aliases and search tags attached', async () => {
    const pickerIcons = await loadLucidePickerIcons();
    const names = pickerIcons.map((icon) => icon.name);

    expect(names).toContain('activity');
    expect(names).toContain('library');
    // 'alarm-check' is a deprecated alias of 'alarm-clock-check' — same glyph,
    // hidden from the grid but searchable through the canonical entry.
    expect(names).not.toContain('alarm-check');
    const alarmClockCheck = pickerIcons.find((icon) => icon.name === 'alarm-clock-check');
    expect(alarmClockCheck?.aliases).toContain('alarm-check');
    // 'home' aliases 'house' — the picker search relies on this mapping.
    const house = pickerIcons.find((icon) => icon.name === 'house');
    expect(house?.aliases).toContain('home');
    // Synonym tags power vocabulary search ('delete' finds the trash icons).
    const trash = pickerIcons.find((icon) => icon.name === 'trash-2');
    expect(trash?.tags).toContain('delete');
    // Multi-word tags are hyphenated to match the picker's normalized query,
    // which turns 'air conditioner' into 'air-conditioner'.
    const airVent = pickerIcons.find((icon) => icon.tags.some((tag) => tag.includes('air-condition')));
    expect(airVent).toBeDefined();
    expect(pickerIcons.every((icon) => icon.tags.every((tag) => !tag.includes(' ')))).toBe(true);
  });
});
