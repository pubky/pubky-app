import { describe, expect, it } from 'vitest';
import {
  getLoadedLucideIconNode,
  isLucideIconName,
  loadLucideIconNode,
  LUCIDE_CANONICAL_ICON_NAMES,
  LUCIDE_ICON_NAMES,
  preloadLucideIcons,
} from './lucideIcons';

describe('lucideIcons', () => {
  it('exposes the installed Lucide icon names', () => {
    expect(LUCIDE_ICON_NAMES).toContain('activity');
    expect(LUCIDE_ICON_NAMES).toContain('library');
  });

  it('recognizes valid Lucide icon names', () => {
    expect(isLucideIconName('activity')).toBe(true);
  });

  it('rejects missing and unknown icon names', () => {
    expect(isLucideIconName(undefined)).toBe(false);
    expect(isLucideIconName(null)).toBe(false);
    expect(isLucideIconName('not-a-real-lucide-icon')).toBe(false);
  });

  it('hides deprecated aliases from the canonical list but keeps them valid', () => {
    // 'alarm-check' is a deprecated alias of 'alarm-clock-check' — same glyph.
    expect(LUCIDE_CANONICAL_ICON_NAMES).not.toContain('alarm-check');
    expect(LUCIDE_CANONICAL_ICON_NAMES).toContain('alarm-clock-check');
    expect(isLucideIconName('alarm-check')).toBe(true);
    expect(LUCIDE_CANONICAL_ICON_NAMES.length).toBeLessThan(LUCIDE_ICON_NAMES.length);
  });

  it('loads an icon node and serves it synchronously from the cache afterwards', async () => {
    expect(getLoadedLucideIconNode('mountain')).toBeUndefined();

    const node = await loadLucideIconNode('mountain');

    expect(node).not.toBeNull();
    expect(getLoadedLucideIconNode('mountain')).toBe(node);
  });

  it('dedupes concurrent loads of the same icon', async () => {
    const [first, second] = await Promise.all([loadLucideIconNode('anchor'), loadLucideIconNode('anchor')]);

    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });

  it('preloads valid names and silently skips the rest', async () => {
    expect(() => preloadLucideIcons(['not-a-real-lucide-icon', null, undefined, 'wrench'])).not.toThrow();

    expect(await loadLucideIconNode('wrench')).toBe(getLoadedLucideIconNode('wrench'));
    expect(getLoadedLucideIconNode('wrench')).toBeDefined();
  });
});
