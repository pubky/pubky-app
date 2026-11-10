'use client';

import { useState, useSyncExternalStore } from 'react';
import { pickAlsoOnLanguage, type TAlsoOnEdition } from './ResourceAlsoOn.utils';

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
 * The edition a row of editions shows and links to: the viewer's pick, kept as long as the row is
 * mounted, else the one `pickAlsoOnLanguage` chooses for the browser's languages.
 */
export function useAlsoOnEdition(editions: TAlsoOnEdition[]) {
  const languages = useSyncExternalStore(subscribe, getLanguages, getServerLanguages);
  const [picked, setPicked] = useState<string | null>(null);
  const lang =
    picked !== null && editions.some((edition) => edition.lang === picked)
      ? picked
      : pickAlsoOnLanguage(
          editions.map((edition) => edition.lang),
          languages ? languages.split(',') : [],
        );
  const edition = editions.find((candidate) => candidate.lang === lang) ?? editions[0];
  return { edition, setLang: setPicked };
}
