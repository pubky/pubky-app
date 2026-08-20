import { describe, expect, it } from 'vitest';
import {
  getLoadedLucideIconNode,
  isPlausibleLucideIconName,
  loadLucideIconNode,
  loadLucidePickerIcons,
  preloadLucideIcons,
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

  it('lists canonical picker entries with their deprecated aliases attached', async () => {
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
  });

  it('loads an icon node and serves it synchronously from the cache afterwards', async () => {
    expect(getLoadedLucideIconNode('mountain')).toBeUndefined();

    const node = await loadLucideIconNode('mountain');

    expect(node).not.toBeNull();
    expect(getLoadedLucideIconNode('mountain')).toBe(node);
  });

  it('resolves null for a name the catalog does not contain', async () => {
    const node = await loadLucideIconNode('not-a-real-lucide-icon' as Parameters<typeof loadLucideIconNode>[0]);

    expect(node).toBeNull();
  });

  it('dedupes concurrent loads of the same icon', async () => {
    const [first, second] = await Promise.all([loadLucideIconNode('anchor'), loadLucideIconNode('anchor')]);

    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });

  it('preloads plausible names and silently skips the rest', async () => {
    expect(() => preloadLucideIcons(['Not An Icon', null, undefined, 'wrench'])).not.toThrow();

    expect(await loadLucideIconNode('wrench')).toBe(getLoadedLucideIconNode('wrench'));
    expect(getLoadedLucideIconNode('wrench')).toBeDefined();
  });
});
