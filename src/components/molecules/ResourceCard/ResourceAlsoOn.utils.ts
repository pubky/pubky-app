import type { TPinakesAlsoOn, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getAlsoOnName, getAlsoOnNote, getHttpUrl, getLinkHost, getResourceLinks } from './ResourceCard.utils';

/** One language edition of a service in Also on (`Wikipedia (de)`): its language code and entry. */
export interface TAlsoOnEdition {
  /** The code as the service names it (`de`, `zh-min-nan`, `simple`). */
  lang: string;
  entry: TPinakesAlsoOn;
}

/**
 * One row of an Also on list: an entry as it is, or one service in several languages (every
 * `Wikipedia (xx)` link), shown as one row with a language switcher.
 */
export type TAlsoOnRow =
  { kind: 'entry'; entry: TPinakesAlsoOn } | { kind: 'languages'; name: string; editions: TAlsoOnEdition[] };

/**
 * A service name that ends in a language code in brackets: `Wikipedia (de)`, `Wikipedia (zh-min-nan)`,
 * `Wikipedia (simple)` (Simple English, Wikimedia's one code that is a word).
 */
const LANGUAGE_SUFFIX = /^(.*\S)\s*\(([a-z]{2,3}(?:-[a-z0-9]{1,8})*|simple)\)$/i;

/** Simple English: a Wikipedia of its own, never picked for an English reader. */
const SIMPLE_ENGLISH = 'simple';

/**
 * Wikimedia language codes that are not the BCP 47 tag of their language (`als` is Alemannic there,
 * Albanian in BCP 47; `no` is Bokmål), mapped to that tag for naming and for matching the browser.
 */
const WIKIMEDIA_LANGUAGES: Readonly<Record<string, string>> = {
  als: 'gsw',
  'bat-smg': 'sgs',
  'be-x-old': 'be-tarask',
  'fiu-vro': 'vro',
  no: 'nb',
  'roa-rup': 'rup',
  'zh-classical': 'lzh',
  'zh-min-nan': 'nan',
  'zh-yue': 'yue',
};

/** The BCP 47 tag of a language code, lower case, Wikimedia's own codes included. */
function toLanguageTag(code: string): string {
  const lower = code.toLowerCase();
  return WIKIMEDIA_LANGUAGES[lower] ?? lower;
}

/**
 * The service and language an entry is an edition of, or `null`: a web link whose name ends in a
 * language code that its host starts with (`Wikipedia (de)` on `de.wikipedia.org`). Editions with
 * the same name and host after the code are one service.
 */
function getEdition(entry: TPinakesAlsoOn): { key: string; name: string; lang: string } | null {
  const match = entry.site?.trim().match(LANGUAGE_SUFFIX);
  const labels = getLinkHost(entry.uri)?.toLowerCase().split('.');
  if (!match || !labels || labels.length < 3) return null;
  const [, name, lang] = match;
  if (labels[0] !== lang.toLowerCase()) return null;
  return { key: `${name.toLowerCase()}\n${labels.slice(1).join('.')}`, name, lang };
}

/**
 * One entry per service, by name or by host, where the service is first listed: its first entry,
 * or its first with a web link. Language editions differ in both and stay for `groupAlsoOn`.
 */
export function dedupeAlsoOn(alsoOn: TPinakesAlsoOn[]): TPinakesAlsoOn[] {
  const kept = new Map<string, TPinakesAlsoOn>();
  const keyOfHost = new Map<string, string>();
  for (const entry of alsoOn) {
    const host = getLinkHost(entry.uri)?.toLowerCase();
    const key = (host && keyOfHost.get(host)) || getAlsoOnName(entry).toLowerCase();
    if (host && !keyOfHost.has(host)) keyOfHost.set(host, key);
    const first = kept.get(key);
    if (!first || (!getHttpUrl(first.uri) && getHttpUrl(entry.uri))) kept.set(key, entry);
  }
  return [...kept.values()];
}

/** The service a card is on: its name and its links (the canonical one and the one as written). */
export interface TOwnService {
  site: string | null | undefined;
  uris: (string | null | undefined)[];
}

/**
 * What a card's Also on lists: one entry per service (`dedupeAlsoOn`) in Pinakes' order, never the
 * card's own service (matched by name or host), which its header already opens.
 */
export function pickAlsoOn(alsoOn: TPinakesAlsoOn[], own: TOwnService): TPinakesAlsoOn[] {
  const ownName = own.site?.trim().toLowerCase();
  const ownHosts = new Set(own.uris.map((uri) => getLinkHost(uri)?.toLowerCase()).filter(Boolean));
  return dedupeAlsoOn(
    alsoOn.filter((entry) => {
      const host = getLinkHost(entry.uri)?.toLowerCase();
      if (host && ownHosts.has(host)) return false;
      return !ownName || getAlsoOnName(entry).toLowerCase() !== ownName;
    }),
  );
}

/**
 * The ⋯ menu's Also on: the card's other services, one row each, without its own service (the
 * card's header opens it), or `null` when that leaves none.
 */
export function getMenuAlsoOn(card: TPinakesResourceDetail, url: string): TPinakesResourceDetail['also_on'] | null {
  const { sourceUri, siteName } = getResourceLinks(card, url);
  const alsoOn = pickAlsoOn(card.also_on, { site: siteName, uris: [card.uri, url, sourceUri] });
  return alsoOn.length > 0 ? alsoOn : null;
}

/**
 * Also on as rows: the editions of one service in two or more languages become one row, where its
 * first edition stands; every other entry (a service in one language included) stays as it is, in
 * order. A second link for a language a row already has stays its own row, so nothing is dropped.
 */
export function groupAlsoOn(alsoOn: TPinakesAlsoOn[]): TAlsoOnRow[] {
  const editions = alsoOn.map(getEdition);
  const groups = new Map<string, { name: string; editions: TAlsoOnEdition[]; members: Set<number> }>();
  editions.forEach((edition, index) => {
    if (!edition) return;
    const group = groups.get(edition.key) ?? { name: edition.name, editions: [], members: new Set<number>() };
    groups.set(edition.key, group);
    const lang = edition.lang.toLowerCase();
    if (group.editions.some((member) => member.lang.toLowerCase() === lang)) return;
    group.editions.push({ lang: edition.lang, entry: alsoOn[index] });
    group.members.add(index);
  });

  const rows: TAlsoOnRow[] = [];
  const placed = new Set<string>();
  alsoOn.forEach((entry, index) => {
    const edition = editions[index];
    const group = edition && groups.get(edition.key);
    if (!edition || !group || group.editions.length < 2 || !group.members.has(index)) {
      rows.push({ kind: 'entry', entry });
      return;
    }
    if (placed.has(edition.key)) return;
    placed.add(edition.key);
    rows.push({ kind: 'languages', name: group.name, editions: group.editions });
  });
  return rows;
}

/**
 * The language a row of editions shows first: the viewer's first preferred language it has
 * (`de-CH` takes `de`), else English, else its first edition. A hyphenated edition (`zh-yue`) is a
 * language of its own, never matched as a region.
 *
 * @param preferred - The viewer's languages in order (`navigator.languages`)
 */
export function pickAlsoOnLanguage(langs: string[], preferred: readonly string[]): string {
  const tags = langs.map(toLanguageTag);
  for (const language of preferred) {
    const wanted = toLanguageTag(language);
    const exact = tags.indexOf(wanted);
    const index = exact >= 0 ? exact : tags.indexOf(toLanguageTag(wanted.split('-')[0]));
    if (index >= 0) return langs[index];
  }
  const english = tags.indexOf('en');
  return langs[english >= 0 ? english : 0];
}

/**
 * A language's own name with its code, as a switcher lists it (`Deutsch (de)`, `Français (fr)`);
 * the code alone when the runtime does not know it.
 */
export function getLanguageName(lang: string): string {
  if (lang.toLowerCase() === SIMPLE_ENGLISH) return `Simple English (${lang})`;
  const tag = toLanguageTag(lang);
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    if (name && name.toLowerCase() !== tag) {
      return `${name.charAt(0).toLocaleUpperCase(tag)}${name.slice(1)} (${lang})`;
    }
  } catch {
    // An invalid tag: the code is all there is to show.
  }
  return lang;
}

/** The `lang` attribute for a language's name: its BCP 47 tag (`gsw` for Wikipedia's `als`). */
export function getLanguageTag(lang: string): string {
  return lang.toLowerCase() === SIMPLE_ENGLISH ? 'en' : toLanguageTag(lang);
}

/**
 * What the resource page's row of editions says under its name: the language shown, then the
 * entry's own note, without where it was found (that is in the row's tooltip).
 */
export function getAlsoOnEditionNote(edition: TAlsoOnEdition): string {
  const note = getAlsoOnNote(edition.entry, undefined, { withSource: false });
  const language = getLanguageName(edition.lang);
  return note ? `${language} · ${note}` : language;
}
