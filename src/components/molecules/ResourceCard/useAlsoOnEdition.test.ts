import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TAlsoOnEdition } from './ResourceAlsoOn.utils';
import { useAlsoOnEdition } from './useAlsoOnEdition';

const edition = (lang: string): TAlsoOnEdition => ({
  lang,
  entry: { uri: `https://${lang}.wikipedia.org/wiki/Berlin`, site: `Wikipedia (${lang})` },
});
const EDITIONS = ['ar', 'de', 'en', 'fr'].map(edition);

describe('useAlsoOnEdition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on the browser’s language, else English', () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fr-CH', 'fr']);
    expect(renderHook(() => useAlsoOnEdition(EDITIONS)).result.current.edition.lang).toBe('fr');

    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fi']);
    expect(renderHook(() => useAlsoOnEdition(EDITIONS)).result.current.edition.lang).toBe('en');
  });

  it('follows a change of the browser’s languages (`languagechange`)', () => {
    const languages = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en']);
    const { result } = renderHook(() => useAlsoOnEdition(EDITIONS));
    expect(result.current.edition.lang).toBe('en');

    languages.mockReturnValue(['de']);
    act(() => {
      window.dispatchEvent(new Event('languagechange'));
    });

    expect(result.current.edition.lang).toBe('de');
  });

  it('keeps the viewer’s pick, and falls back to the default when the pick is no longer listed', () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en']);
    const { result, rerender } = renderHook(({ editions }) => useAlsoOnEdition(editions), {
      initialProps: { editions: EDITIONS },
    });

    act(() => result.current.setLang('ar'));
    expect(result.current.edition).toBe(EDITIONS[0]);

    rerender({ editions: EDITIONS.slice(1) });
    expect(result.current.edition.lang).toBe('en');
  });
});
