import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import type { TAlsoOnEdition } from './ResourceAlsoOn.utils';
import { useAlsoOnEdition } from './useAlsoOnEdition';

const edition = (lang: string): TAlsoOnEdition => ({
  lang,
  entry: { uri: `https://${lang}.wikipedia.org/wiki/Berlin`, site: `Wikipedia (${lang})` },
});
const EDITIONS = ['ar', 'de', 'en', 'fr'].map(edition);
const choiceLangs = (editions: TAlsoOnEdition[]) => editions.map(({ lang }) => lang);
const setLanguages = (languages: string[] | undefined) =>
  useSettingsStore.setState({ media: { ...defaultMediaPreferences, languages } });

describe('useAlsoOnEdition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState({ media: defaultMediaPreferences });
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

  describe('the switcher’s languages (`choices`)', () => {
    it('Auto, one browser language the row has: that edition and no other choice', () => {
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-CH', 'de']);
      const { current } = renderHook(() => useAlsoOnEdition(EDITIONS)).result;

      expect(current.edition.lang).toBe('de');
      expect(choiceLangs(current.choices)).toEqual(['de']);
    });

    it('Auto, several browser languages the row has: only those, in the browser’s order', () => {
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fr-CH', 'fi', 'en-US']);
      const { current } = renderHook(() => useAlsoOnEdition(EDITIONS)).result;

      expect(current.edition.lang).toBe('fr');
      expect(choiceLangs(current.choices)).toEqual(['fr', 'en']);
    });

    it('a chosen list takes the place of the browser’s languages, in its order', () => {
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en']);
      setLanguages(['fr', 'it', 'ar']);
      const { current } = renderHook(() => useAlsoOnEdition(EDITIONS)).result;

      expect(current.edition.lang).toBe('fr');
      expect(choiceLangs(current.choices)).toEqual(['fr', 'ar']);

      setLanguages(['de']);
      const { current: one } = renderHook(() => useAlsoOnEdition(EDITIONS)).result;
      expect(one.edition.lang).toBe('de');
      expect(choiceLangs(one.choices)).toEqual(['de']);
    });

    it('none of the languages: English, else the first, with every edition to choose from', () => {
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de']);
      setLanguages(['fi']);
      const { current } = renderHook(() => useAlsoOnEdition(EDITIONS)).result;
      expect(current.edition.lang).toBe('en');
      expect(current.choices).toBe(EDITIONS);

      setLanguages([]);
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fi']);
      const { current: auto } = renderHook(() => useAlsoOnEdition(EDITIONS.slice(0, 2))).result;
      expect(auto.edition.lang).toBe('ar');
      expect(choiceLangs(auto.choices)).toEqual(['ar', 'de']);
    });

    it('matches the setting’s codes as they are, the browser’s by their base language too', () => {
      const lowSaxon = ['nds', 'en'].map(edition);
      setLanguages(['nds-nl']);
      const { current } = renderHook(() => useAlsoOnEdition(lowSaxon)).result;
      expect(current.edition.lang).toBe('en');
      expect(current.choices).toBe(lowSaxon);

      setLanguages(undefined);
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['nds-NL']);
      const { current: auto } = renderHook(() => useAlsoOnEdition(lowSaxon)).result;
      expect(auto.edition.lang).toBe('nds');
      expect(choiceLangs(auto.choices)).toEqual(['nds']);
    });

    it('keeps a pick among the choices only', () => {
      setLanguages(['fr', 'ar']);
      const { result } = renderHook(() => useAlsoOnEdition(EDITIONS));

      act(() => result.current.setLang('ar'));
      expect(result.current.edition.lang).toBe('ar');

      act(() => result.current.setLang('de'));
      expect(result.current.edition.lang).toBe('fr');
    });
  });

  it('keeps the viewer’s pick, and falls back to the default when the pick is no longer listed', () => {
    // None of the browser's languages: every edition is a choice.
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fi']);
    const { result, rerender } = renderHook(({ editions }) => useAlsoOnEdition(editions), {
      initialProps: { editions: EDITIONS },
    });

    act(() => result.current.setLang('ar'));
    expect(result.current.edition).toBe(EDITIONS[0]);

    rerender({ editions: EDITIONS.slice(1) });
    expect(result.current.edition.lang).toBe('en');
  });
});
