import { describe, expect, it, vi } from 'vitest';
import {
  getLucideIconState,
  isPlausibleLucideIconName,
  loadLucidePickerIcons,
  preloadLucideIcons,
  requestLucideIcon,
  subscribeToLucideIcons,
} from './lucideIcons';

describe('lucideIcons', () => {
  it('accepts kebab-case icon name shapes, including foreign ones', () => {
    expect(isPlausibleLucideIconName('activity')).toBe(true);
    expect(isPlausibleLucideIconName('alarm-clock-check')).toBe(true);
    // Another client's icon set — must pass the shape check so it round-trips.
    expect(isPlausibleLucideIconName('not-a-real-lucide-icon')).toBe(true);
  });

  it('rejects missing and malformed icon names', () => {
    expect(isPlausibleLucideIconName(undefined)).toBe(false);
    expect(isPlausibleLucideIconName(null)).toBe(false);
    expect(isPlausibleLucideIconName('')).toBe(false);
    expect(isPlausibleLucideIconName('Not An Icon')).toBe(false);
    expect(isPlausibleLucideIconName('-leading-dash')).toBe(false);
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

  it('preloads plausible names and silently skips the rest', async () => {
    expect(() => preloadLucideIcons(['Not An Icon', null, undefined, 'library'])).not.toThrow();

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
  });
});
