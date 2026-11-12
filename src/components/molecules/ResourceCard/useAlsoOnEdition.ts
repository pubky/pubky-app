'use client';

import { useState, useSyncExternalStore } from 'react';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { matchAlsoOnLanguages, pickAlsoOnLanguage, type TAlsoOnEdition } from './ResourceAlsoOn.utils';

function subscribe(onChange: () => void) {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

/** The viewer's languages as one string, a stable snapshot (`navigator.languages` is a new array). */
function getLanguages(): string {
  return (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean).join(',');
}

/** No languages on the server: it shows English, else the first edition, then the browser's once hydrated. */
function getServerLanguages(): string {
  return '';
}

/**
 * The edition a row of editions shows and links to, and the editions its language switcher lists
 * (`choices`; with fewer than two there is no switcher). The viewer's languages are the Wikipedia
 * languages set in Links and Media, else the browser's. The editions in those languages are the
 * choices, in that order, and the first one shows; with none of them, every edition is a choice and
 * `pickAlsoOnLanguage`'s fallback shows (English, else the first). The viewer's pick is kept as
 * long as the row is mounted.
 */
export function useAlsoOnEdition(editions: TAlsoOnEdition[]) {
  const languages = useSyncExternalStore(subscribe, getLanguages, getServerLanguages);
  const chosen = useSettingsStore((state) => state.media.languages);
  const [picked, setPicked] = useState<string | null>(null);
  const langs = editions.map((edition) => edition.lang);
  const isChosen = Boolean(chosen?.length);
  const preferred = chosen?.length ? chosen : languages ? languages.split(',') : [];
  // The setting holds edition codes: matched as they are, never by their base language.
  const matches = matchAlsoOnLanguages(langs, preferred, { exact: isChosen });
  // Editions are one per language (`groupAlsoOn`), so each match is one edition.
  const choices =
    matches.length > 0 ? matches.flatMap((lang) => editions.filter((edition) => edition.lang === lang)) : editions;
  const lang =
    picked !== null && choices.some((edition) => edition.lang === picked)
      ? picked
      : pickAlsoOnLanguage(langs, preferred, { exact: isChosen });
  const edition = editions.find((candidate) => candidate.lang === lang) ?? editions[0];
  return { edition, choices, setLang: setPicked };
}
