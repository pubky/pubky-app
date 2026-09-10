import { afterEach, describe, expect, it } from 'vitest';
import {
  clearVibeSessionAutoRestoreSuppressed,
  isVibeSessionAutoRestoreSuppressed,
  suppressVibeSessionAutoRestore,
} from './auto-restore';
import {
  clearFragmentSessionExport,
  consumeFragmentSessionExport,
  hasPendingFragmentSessionExport,
  readFragmentSessionExport,
  resetFragmentSessionExportCache,
  takeFragmentSessionExport,
} from './fragment';

const EXPORT = 'session-export-value';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  resetFragmentSessionExportCache();
  clearVibeSessionAutoRestoreSuppressed();
});

describe('fragment session export', () => {
  it('reads #s= and returns null when missing or empty', () => {
    window.history.replaceState(null, '', '/');
    expect(readFragmentSessionExport(window)).toBeNull();

    window.history.replaceState(null, '', '/#s=');
    expect(readFragmentSessionExport(window)).toBeNull();

    window.history.replaceState(null, '', `/#s=${encodeURIComponent(EXPORT)}`);
    expect(readFragmentSessionExport(window)).toBe(EXPORT);
  });

  it('strips only s from the hash and preserves other hash params and search', () => {
    window.history.replaceState(null, '', `/vibe?x=1#other=keep&s=${encodeURIComponent(EXPORT)}`);
    expect(readFragmentSessionExport(window)).toBe(EXPORT);
    clearFragmentSessionExport(window);
    expect(window.location.hash).not.toContain('s=');
    expect(window.location.hash).toContain('other=keep');
    expect(window.location.search).toBe('?x=1');
    expect(readFragmentSessionExport(window)).toBeNull();
  });

  it('leaves the URL unchanged when #s= is absent', () => {
    window.history.replaceState(null, '', '/path?q=1#other=keep');
    clearFragmentSessionExport(window);
    expect(window.location.pathname).toBe('/path');
    expect(window.location.search).toBe('?q=1');
    expect(window.location.hash).toBe('#other=keep');
  });

  it('round-trips base64 session exports with + / =', () => {
    const raw = 'abc+/def==';
    const hash = `#s=${encodeURIComponent(raw)}`;
    window.history.replaceState(null, '', `/${hash}`);
    expect(readFragmentSessionExport(window)).toBe(raw);
    consumeFragmentSessionExport(window);
    expect(window.location.hash).not.toContain('s=');
  });

  it('consume caches the value and strips even on a later call', () => {
    window.history.replaceState(null, '', `/#s=${encodeURIComponent(EXPORT)}`);
    expect(consumeFragmentSessionExport(window)).toBe(EXPORT);
    expect(window.location.hash).not.toContain('s=');
    expect(consumeFragmentSessionExport(window)).toBe(EXPORT);
    expect(takeFragmentSessionExport(window)).toBe(EXPORT);
    expect(takeFragmentSessionExport(window)).toBeNull();
  });

  it('strips #s= on consume even when the cache is already empty', () => {
    takeFragmentSessionExport(window);
    window.history.replaceState(null, '', `/#s=${encodeURIComponent(EXPORT)}`);
    expect(consumeFragmentSessionExport(window)).toBeNull();
    expect(window.location.hash).not.toContain('s=');
  });

  it('does not clear auto-restore suppression when a #s= fragment is consumed', () => {
    suppressVibeSessionAutoRestore();
    window.history.replaceState(null, '', `/#s=${encodeURIComponent(EXPORT)}`);
    expect(consumeFragmentSessionExport(window)).toBe(EXPORT);
    expect(isVibeSessionAutoRestoreSuppressed()).toBe(true);
  });

  it('hasPendingFragmentSessionExport is true when #s= is present', () => {
    window.history.replaceState(null, '', `/#s=${encodeURIComponent(EXPORT)}`);
    expect(hasPendingFragmentSessionExport(window)).toBe(true);
    expect(hasPendingFragmentSessionExport(window)).toBe(true);
  });

  it('hasPendingFragmentSessionExport is false after takeFragmentSessionExport', () => {
    window.history.replaceState(null, '', `/#s=${encodeURIComponent(EXPORT)}`);
    expect(hasPendingFragmentSessionExport(window)).toBe(true);
    expect(takeFragmentSessionExport(window)).toBe(EXPORT);
    expect(hasPendingFragmentSessionExport(window)).toBe(false);
  });

  it('hasPendingFragmentSessionExport is false when no fragment is present', () => {
    window.history.replaceState(null, '', '/');
    expect(hasPendingFragmentSessionExport(window)).toBe(false);
  });
});
