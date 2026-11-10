import type { TPinakesAddress, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getHttpUrl, getNearestTypes } from './ResourceCard.utils';

/**
 * What a card says about itself beyond its name and description, from the resource read's `facts`
 * (every value a string; lists joined with `"; "`) and the read's own fields (`start`, `address`,
 * ...): one summary line under the title (`getResourceSummary`) and, on the resource page, every
 * fact as a labelled row (`getResourceFactRows`).
 *
 * Which facts make the summary depends on the card's type: the nearest entry of `SUMMARIES` in its
 * `type_path` (`BarOrPub` → `Place`). A type without one has no summary line, and its page lists
 * its facts all the same.
 */

/** The card fields the summary and the fact rows read. */
export type TResourceFactsCard = Pick<TPinakesResourceDetail, 'type' | 'type_path'> &
  Partial<Pick<TPinakesResourceDetail, 'facts' | 'start' | 'end' | 'address' | 'category' | 'site' | 'point'>>;

const LIST_SEPARATOR = '; ';
const SUMMARY_SEPARATOR = ' · ';
/** A summary line names at most this many things: more reads as a list, which the page has. */
const MAX_SUMMARY_PARTS = 3;
/** List facts show this many values on the summary line, then `+N`. */
const MAX_SUMMARY_LIST_ITEMS = 2;
const SATS_PER_BTC = 100_000_000;
/** A summary value this long or longer is left out when the title contains it. */
const MIN_SAID_LENGTH = 3;
/** From this many sats on, an amount reads in BTC (0.01 BTC). */
const BTC_THRESHOLD_SATS = 1_000_000;
/** A time at midnight UTC, the way sources write a bare day as a timestamp. */
const MIDNIGHT_UTC = /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/i;
/** A partial date as MusicBrainz and other sources give it: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`. */
const PARTIAL_DATE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

/** A fact's value as text: trimmed, `null` when absent or empty. A number reads as written. */
export function getFact(card: Pick<TResourceFactsCard, 'facts'>, key: string): string | null {
  const value: unknown = card.facts?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toNumber(value: string | null): number | null {
  if (value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `in_stock` → `In stock`, `COMPLETED` → `Completed`, `research` → `Research`. */
export function humanizeValue(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim();
  const lower = words === words.toUpperCase() ? words.toLowerCase() : words;
  return capitalize(lower);
}

/** `369` seconds → `6:09`, `5100` → `1:25:00`. `null` for anything but a positive number. */
export function formatDuration(seconds: string | number | null | undefined): string | null {
  const total = typeof seconds === 'number' ? seconds : toNumber(seconds ?? null);
  if (total === null || total <= 0) return null;
  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** `120` minutes → `2 h`, `90` → `1 h 30 min`, `45` → `45 min`. */
export function formatMinutes(minutes: string | null): string | null {
  const value = toNumber(minutes);
  if (value === null || value <= 0) return null;
  const total = Math.round(value);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** A whole number with the locale's grouping: `46969` → `46,969`. */
export function formatCount(value: string | null, locale?: string): string | null {
  const number = toNumber(value);
  return number === null ? null : new Intl.NumberFormat(locale).format(number);
}

/** A large count, short: `69695` → `69.7K`. */
export function formatCompactCount(value: string | null, locale?: string): string | null {
  const number = toNumber(value);
  if (number === null) return null;
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

/** An amount in sats: `5770586745` → `57.71 BTC`, `500000` → `500,000 sats`. */
export function formatSats(value: string | null, locale?: string): string | null {
  const sats = toNumber(value);
  if (sats === null || sats < 0) return null;
  if (sats >= BTC_THRESHOLD_SATS) {
    const btc = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(sats / SATS_PER_BTC);
    return `${btc} BTC`;
  }
  return `${new Intl.NumberFormat(locale).format(sats)} sats`;
}

/** `149` `USD` → `$149.00`; `0` → `Free`. Without a valid currency the number alone. */
export function formatMoney(price: string | null, currency: string | null, locale?: string): string | null {
  const amount = toNumber(price);
  if (amount === null || amount < 0) return null;
  if (amount === 0) return 'Free';
  if (!currency) return new Intl.NumberFormat(locale).format(amount);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale).format(amount)} ${currency}`;
  }
}

/** A list fact's values (joined with `"; "` by Pinakes), empty ones dropped. */
export function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** The first `max` values of a list fact, then `+N` for the rest: `cli, rust +3`. */
export function formatList(value: string | null, max = Number.POSITIVE_INFINITY): string | null {
  const items = splitList(value);
  if (items.length === 0) return null;
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} +${items.length - max}` : shown;
}

function displayName(type: 'region' | 'language', code: string, locale?: string): string | null {
  try {
    const name = new Intl.DisplayNames(locale ? [locale] : undefined, { type }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** `NL` → `Netherlands`, `ch` → `Switzerland`; the code itself when the locale has no name for it. */
export function formatCountry(code: string | null | undefined, locale?: string): string | null {
  const value = code?.trim();
  if (!value) return null;
  return displayName('region', value.toUpperCase(), locale) ?? value.toUpperCase();
}

/** `pt-BR` → `Brazilian Portuguese`, `en-US` → `American English`; the tag itself without a name. */
export function formatLanguage(tag: string | null, locale?: string): string | null {
  if (!tag) return null;
  return displayName('language', tag, locale) ?? tag;
}

/**
 * A date fact in the viewer's locale: `2023-05-31` → `May 31, 2023`, `1997` → `1997`, `2010-05` →
 * `May 2010`, an RFC 3339 time → its day in the viewer's zone. Dates without a time are read in
 * UTC, so they never move a day. `null` for a value that is not a date.
 */
export function formatFactDate(value: string | null | undefined, locale?: string): string | null {
  const text = value?.trim();
  if (!text) return null;
  const partial = PARTIAL_DATE.exec(text);
  if (partial) {
    const [, year, month, day] = partial;
    if (!month) return year;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, day ? Number(day) : 1));
    // `2023-02-31` is not a date (Date would roll it into March).
    if (date.getUTCMonth() !== Number(month) - 1 || (day && date.getUTCDate() !== Number(day))) return null;
    const options: Intl.DateTimeFormatOptions = day
      ? { dateStyle: 'medium', timeZone: 'UTC' }
      : { month: 'short', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  // Midnight UTC is how sources write a day without a time (`2020-04-29T00:00:00Z`): read it in UTC,
  // or it moves a day west of UTC.
  const timeZone = MIDNIGHT_UTC.test(text) ? 'UTC' : undefined;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(date);
}

/** The year of a date fact: `2013-07-31` → `2013`. */
export function formatYear(value: string | null | undefined): string | null {
  return /^\d{4}/.exec(value?.trim() ?? '')?.[0] ?? null;
}

/** `1997` → `1997`, `1997`–`2021` → `1997–2021`, an open span `1997–`. */
function formatSpan(begin: string | null, end: string | null): string | null {
  const from = formatYear(begin);
  const to = formatYear(end);
  if (!from) return null;
  if (!to) return `${from}–`;
  return from === to ? from : `${from}–${to}`;
}

/** Countries that write the house number before the street (`1 Fremont Street`). */
const NUMBER_FIRST: ReadonlySet<string> = new Set(['US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'FR']);
/** Countries that write the postcode after the city (`Las Vegas 89101`). */
const POSTCODE_LAST: ReadonlySet<string> = new Set(['US', 'CA', 'GB', 'IE', 'AU', 'NZ']);

/**
 * A place's address in one line: `Niederdorfstrasse 1, 8001 Zürich, Switzerland`, `1 Fremont
 * Street, Las Vegas 89101, United States`. Parts it does not have are left out; `null` without any.
 */
export function formatAddress(address: TPinakesAddress | null | undefined, locale?: string): string | null {
  if (!address) return null;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const countryKey = text(address.country_code)?.toUpperCase() ?? '';
  const streetParts = [text(address.street), text(address.house_number)];
  const cityParts = [text(address.postcode), text(address.city)];
  const street = (NUMBER_FIRST.has(countryKey) ? streetParts.reverse() : streetParts).filter(Boolean).join(' ');
  const city = (POSTCODE_LAST.has(countryKey) ? cityParts.reverse() : cityParts).filter(Boolean).join(' ');
  const country = formatCountry(text(address.country_code), locale);
  const parts = [street, city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** An OSM `category` (`amenity/arts_centre`) in words: `Arts centre`. */
export function formatCategory(category: string | null | undefined): string | null {
  const value = category?.split('/').at(-1)?.trim();
  return value ? humanizeValue(value) : null;
}

/**
 * One part of a summary line. `isSaid` tells whether the title or description already says a
 * value, so `firstOf` can fall through to its next option.
 */
type SummaryPart = (card: TResourceFactsCard, locale?: string, isSaid?: (value: string) => boolean) => string | null;

const fact =
  (key: string, format: (value: string | null, locale?: string) => string | null = (value) => value): SummaryPart =>
  (card, locale) =>
    format(getFact(card, key), locale);

const prefixed =
  (prefix: string, part: SummaryPart): SummaryPart =>
  (card, locale, isSaid) => {
    const value = part(card, locale, isSaid);
    return value ? `${prefix}${value}` : null;
  };

const suffixed =
  (part: SummaryPart, suffix: string): SummaryPart =>
  (card, locale, isSaid) => {
    const value = part(card, locale, isSaid);
    return value ? `${value}${suffix}` : null;
  };

/** The first part that has a value the title or description does not already say. */
const firstOf =
  (...parts: SummaryPart[]): SummaryPart =>
  (card, locale, isSaid) => {
    for (const part of parts) {
      const value = part(card, locale, isSaid);
      if (value && !isSaid?.(value)) return value;
    }
    return null;
  };

const dateFact = (key: string) => fact(key, formatFactDate);
const listFact = (key: string) => fact(key, (value) => formatList(value, MAX_SUMMARY_LIST_ITEMS));
const startDate: SummaryPart = (card, locale) => formatFactDate(card.start, locale);
const humanFact = (key: string) => fact(key, (value) => (value ? humanizeValue(value) : null));

/** An artist (`MusicGroup`, or a `Person` MusicBrainz describes): what kind, where, when. */
const ARTIST_SUMMARY: SummaryPart[] = [
  firstOf(
    fact('disambiguation', (value) => (value ? capitalize(value) : null)),
    // The bare kind ("Group", "Artist") repeats the type label: only with where or when it is from.
    (card) => {
      const type = getFact(card, 'artist_type');
      const placed =
        getFact(card, 'area') ||
        getFact(card, 'country_code') ||
        getFact(card, 'begin_date') ||
        getFact(card, 'end_date');
      if (!type || !placed) return null;
      return type === 'Person' ? 'Artist' : humanizeValue(type);
    },
  ),
  firstOf(fact('area'), fact('country_code', formatCountry)),
  (card) => formatSpan(getFact(card, 'begin_date'), getFact(card, 'end_date')),
  listFact('genre'),
];

const ARTICLE_SUMMARY: SummaryPart[] = [fact('author'), dateFact('published')];

const POSTING_SUMMARY: SummaryPart[] = [
  firstOf(fact('author', (value) => (value ? `@${value.replace(/^@/, '')}` : null))),
  prefixed('~', fact('territory')),
  firstOf(suffixed(fact('sats', formatCount), ' sats'), suffixed(fact('score', formatCount), ' points')),
  suffixed(fact('comment_count', formatCount), ' comments'),
];

const PLACE_SUMMARY: SummaryPart[] = [(card, locale) => formatAddress(card.address, locale)];

const ORGANIZATION_SUMMARY: SummaryPart[] = [
  fact('acronyms', (value) => formatList(value, 1)),
  (card, locale) =>
    [getFact(card, 'city'), getFact(card, 'country') ?? formatCountry(getFact(card, 'country_code'), locale)]
      .filter(Boolean)
      .join(', ') || null,
  prefixed('est. ', fact('established')),
];

/**
 * The summary line per type: the parts in order, empty ones skipped, at most `MAX_SUMMARY_PARTS`.
 * Event cards show their dates, venue and organizer on lines of their own (`ResourceCard`).
 */
const SUMMARIES: Readonly<Record<string, SummaryPart[]>> = {
  MusicRecording: [
    firstOf(fact('artist'), fact('performer')),
    fact('duration', formatDuration),
    firstOf(fact('original_album'), fact('first_release_date', formatYear)),
  ],
  MusicAlbum: [fact('artist'), fact('release_type'), fact('first_release_date', formatYear)],
  // Other events show their dates, venue and organizer on lines of their own (`ResourceCard`).
  MusicEvent: [fact('performer')],
  MusicGroup: ARTIST_SUMMARY,
  VideoObject: [firstOf(fact('artist'), fact('author')), fact('duration', formatDuration), dateFact('published')],
  Movie: [fact('title_description')],
  TVSeries: [fact('title_description')],
  PodcastEpisode: [fact('duration', formatDuration), dateFact('published')],
  Article: ARTICLE_SUMMARY,
  BlogPosting: ARTICLE_SUMMARY,
  NewsArticle: ARTICLE_SUMMARY,
  DiscussionForumPosting: POSTING_SUMMARY,
  SocialMediaPosting: POSTING_SUMMARY,
  EmailMessage: [
    fact('author', (value) => value?.replace(/\s+via\s+.*$/i, '').replace(/^'(.*)'$/, '$1') || null),
    fact('list'),
    dateFact('published'),
  ],
  Book: [fact('author'), fact('first_published', formatYear)],
  Recipe: [fact('total_minutes', formatMinutes), prefixed('Serves ', fact('recipe_yield')), fact('cuisine')],
  SoftwareSourceCode: [
    fact('language'),
    prefixed('★ ', fact('stars', formatCompactCount)),
    fact('license'),
    prefixed('updated ', dateFact('updated')),
  ],
  SoftwareApplication: [fact('developer'), fact('category'), prefixed('v', fact('version')), fact('license')],
  Product: [
    (card, locale) => formatMoney(getFact(card, 'price'), getFact(card, 'price_currency'), locale),
    humanFact('availability'),
    firstOf(fact('brand'), fact('seller')),
  ],
  Dataset: [
    firstOf(listFact('authors'), humanFact('classification')),
    firstOf(fact('license'), humanFact('methods')),
    firstOf(fact('published', formatYear), fact('citation_year'), fact('deposit_date', formatYear)),
  ],
  Legislation: [
    firstOf(
      fact('document_type'),
      fact('resource_type', (value) => (value === 'REG' ? 'Regulation' : value)),
    ),
    fact('in_force', (value) => (value === 'true' ? 'In force' : value === 'false' ? 'Not in force' : null)),
    firstOf(dateFact('document_date'), dateFact('publication_date')),
    fact('citation'),
  ],
  Report: [
    prefixed('Form ', fact('form')),
    fact('company'),
    prefixed('filed ', dateFact('filing_date')),
    prefixed('period ', dateFact('period')),
  ],
  MedicalTrial: [
    humanFact('overall_status'),
    fact('phases', (value) => {
      const phases = splitList(value).map((phase) => phase.replace(/^PHASE/i, ''));
      return phases.length > 0 ? `Phase ${phases.join('/')}` : null;
    }),
    suffixed(fact('enrollment', formatCount), ' enrolled'),
  ],
  JobPosting: [
    fact('hiring_organization'),
    (card) => {
      if (getFact(card, 'remote') !== 'true') return getFact(card, 'location');
      const regions = formatList(getFact(card, 'remote_regions'), MAX_SUMMARY_LIST_ITEMS);
      return regions ? `Remote (${regions})` : 'Remote';
    },
    prefixed('posted ', firstOf(dateFact('date_posted'), startDate)),
    fact('job_status', (value) => (value === 'closed' ? 'Closed' : null)),
  ],
  Organization: ORGANIZATION_SUMMARY,
  // ROR's archives sit under `LocalBusiness` (a `Place`) in schema.org, but carry no address.
  ArchiveOrganization: ORGANIZATION_SUMMARY,
  Taxon: [fact('vernacular_name', (value) => (value ? capitalize(value) : null)), humanFact('rank')],
  Observation: [
    firstOf(fact('common_name'), fact('taxon_name')),
    prefixed('observed ', firstOf(dateFact('observed_on'), startDate)),
    fact('place_guess'),
  ],
  Protein: [listFact('genes'), fact('organism'), suffixed(fact('length', formatCount), ' aa')],
  MolecularEntity: [fact('formula'), suffixed(fact('molecular_weight'), ' g/mol')],
  VisualArtwork: [
    firstOf(
      fact('artist'),
      fact('creators', (value) => value?.replace(/\s*\(.*\)$/, '') || null),
    ),
    firstOf(fact('date'), fact('creation_date')),
    fact('medium'),
  ],
  ImageObject: [
    fact('author'),
    fact('license_short_name'),
    (card) => {
      const width = getFact(card, 'width');
      const height = getFact(card, 'height');
      return width && height ? `${width} × ${height}` : null;
    },
  ],
  LearningResource: [
    suffixed(fact('card_count', formatCount), ' cards'),
    (card, locale) => {
      const front = formatLanguage(getFact(card, 'front_lang'), locale);
      const back = formatLanguage(getFact(card, 'back_lang'), locale);
      return front && back ? `${front} → ${back}` : null;
    },
  ],
  BitcoinBlock: [prefixed('mined ', startDate), fact('pool'), suffixed(fact('tx_count', formatCount), ' transactions')],
  BitcoinTransaction: [
    prefixed('block ', fact('block_height', formatCount)),
    startDate,
    (card) => {
      const inputs = getFact(card, 'inputs');
      const outputs = getFact(card, 'outputs');
      return inputs && outputs ? `${inputs} in → ${outputs} out` : null;
    },
  ],
  BitcoinAddress: [fact('balance', formatSats), suffixed(fact('tx_count', formatCount), ' transactions')],
  LightningNode: [
    suffixed(fact('channels', formatCount), ' channels'),
    suffixed(fact('capacity', formatSats), ' capacity'),
  ],
  LightningChannel: [
    (card) => {
      const one = getFact(card, 'node1_alias');
      const two = getFact(card, 'node2_alias');
      return one && two ? `${one} ↔ ${two}` : null;
    },
    fact('capacity', formatSats),
    humanFact('status'),
  ],
  // Cities and regions: the address is the country (and the city repeats the name).
  AdministrativeArea: [(card, locale) => formatCountry(card.address?.country_code, locale)],
  Place: PLACE_SUMMARY,
};

/**
 * The summary line under the card's title, from its type's entry in `SUMMARIES`: `Daft Punk feat.
 * Pharrell Williams & Nile Rodgers · 6:09 · Random Access Memories`, `Frenchcore artist ·
 * Netherlands`, `Strike · Remote (USA) · posted Sep 14, 2026`. A value the title contains or the
 * description is is left out. Without any, the card's address when it has one, else `null`.
 *
 * @param locale - For tests; the viewer's locale when omitted
 */
export function getResourceSummary(
  card: TResourceFactsCard & Partial<Pick<TPinakesResourceDetail, 'name' | 'description'>>,
  locale?: string,
): string | null {
  // A card MusicBrainz describes as an artist (`artist_type`) is one, whatever its schema.org type
  // (`Person`, `Organization`).
  const parts = getFact(card, 'artist_type')
    ? ARTIST_SUMMARY
    : (getNearestTypes(card)
        .map((type) => SUMMARIES[type])
        .find(Boolean) ?? []);
  const title = card.name?.trim().toLowerCase() ?? '';
  const description = card.description?.trim().toLowerCase() ?? '';
  // Said already: in the title ("Form 10-Q · Franklin Templeton …" names its form and company), or
  // the whole description.
  const isSaid = (value: string) => {
    const lower = value.toLowerCase();
    return (lower.length >= MIN_SAID_LENGTH && title.includes(lower)) || lower === title || lower === description;
  };
  const values: string[] = [];
  for (const part of parts) {
    const value = part(card, locale, isSaid)?.trim();
    if (!value || isSaid(value) || values.includes(value)) continue;
    values.push(value);
    if (values.length === MAX_SUMMARY_PARTS) break;
  }
  if (values.length > 0) return values.join(SUMMARY_SEPARATOR);
  // Whatever its type, a card with an address says where it is.
  return formatAddress(card.address, locale);
}

/** How a fact's value reads on the page. */
type FactFormat = 'text' | 'date' | 'seconds' | 'minutes' | 'count' | 'sats' | 'bool' | 'country' | 'language' | 'list';

/** Facts whose label is not their key in words, and how each known fact's value reads. */
const FACT_FORMATS: Readonly<Record<string, { label?: string; format?: FactFormat; unit?: string }>> = {
  duration: { format: 'seconds' },
  total_minutes: { label: 'Total time', format: 'minutes' },
  recipe_yield: { label: 'Serves' },
  isrc: { label: 'ISRC' },
  isbn: { label: 'ISBN' },
  doi: { label: 'DOI' },
  version_doi: { label: 'Version DOI' },
  citation_doi: { label: 'Citation DOI' },
  citation_pubmed_id: { label: 'Citation PubMed ID' },
  celex: { label: 'CELEX' },
  eli: { label: 'ELI' },
  cik: { label: 'CIK' },
  smiles: { label: 'SMILES' },
  iupac_name: { label: 'IUPAC name' },
  inchikey: { label: 'InChIKey' },
  xlogp: { label: 'XLogP' },
  pmids: { label: 'PubMed IDs', format: 'list' },
  pdb_ids: { label: 'PDB IDs', format: 'list' },
  grid: { label: 'GRID' },
  isni: { label: 'ISNI' },
  sku: { label: 'SKU' },
  country_code: { label: 'Country', format: 'country' },
  front_lang: { label: 'Front language', format: 'language' },
  back_lang: { label: 'Back language', format: 'language' },
  stars: { format: 'count' },
  forks: { format: 'count' },
  enrollment: { format: 'count' },
  tx_count: { label: 'Transactions', format: 'count' },
  unconfirmed_tx_count: { label: 'Unconfirmed transactions', format: 'count' },
  card_count: { label: 'Cards', format: 'count' },
  comment_count: { label: 'Comments', format: 'count' },
  channels: { format: 'count' },
  // A block's height, or an image's in pixels: a count either way.
  height: { format: 'count' },
  width: { format: 'count' },
  block_height: { format: 'count' },
  size: { format: 'count', unit: 'bytes' },
  vsize: { label: 'Virtual size', format: 'count', unit: 'vB' },
  weight: { format: 'count', unit: 'WU' },
  median_fee_rate: { unit: 'sat/vB' },
  length: { format: 'count', unit: 'aa' },
  molecular_weight: { unit: 'g/mol' },
  molecular_weight_kda: { label: 'Molecular weight', unit: 'kDa' },
  exact_mass: { unit: 'Da' },
  positional_accuracy_m: { label: 'Positional accuracy', unit: 'm' },
  balance: { format: 'sats' },
  received: { format: 'sats' },
  capacity: { format: 'sats' },
  reward: { format: 'sats' },
  total_fees: { format: 'sats' },
  fee: { format: 'sats' },
  output_value: { format: 'sats' },
  sats: { format: 'count' },
  in_force: { format: 'bool' },
  has_results: { format: 'bool' },
  reviewed: { format: 'bool' },
  remote: { format: 'bool' },
  coinbase: { format: 'bool' },
  confirmed: { format: 'bool' },
  obscured: { format: 'bool' },
  attribution_required: { format: 'bool' },
  published: { format: 'date' },
  modified: { format: 'date' },
  updated: { format: 'date' },
  updated_at: { label: 'Updated', format: 'date' },
  created: { format: 'date' },
  first_seen: { format: 'date' },
  date_posted: { label: 'Posted', format: 'date' },
  valid_through: { label: 'Closes', format: 'date' },
  document_date: { format: 'date' },
  publication_date: { format: 'date' },
  filing_date: { format: 'date' },
  deposit_date: { format: 'date' },
  completion_date: { format: 'date' },
  start_date: { format: 'date' },
  last_update_posted: { format: 'date' },
  first_public: { format: 'date' },
  last_updated: { format: 'date' },
  observed_on: { label: 'Observed', format: 'date' },
  begin_date: { label: 'Began', format: 'date' },
  end_date: { label: 'Ended', format: 'date' },
  first_release_date: { label: 'First released', format: 'date' },
  price_at: { label: 'Price as of', format: 'date' },
  period: { format: 'date' },
};

/**
 * Facts that are identifiers or links the card already uses (its page, its MusicBrainz or
 * Wikidata ID, a feed's GUID, the stream it plays): not shown as rows.
 */
const HIDDEN_FACTS: ReadonlySet<string> = new Set([
  'page_url',
  'mbid',
  'performer_mbid',
  'wikidata',
  'artist_wikidata',
  'podcast_guid',
  'stream_url',
  'stream_type',
  'stream_duration',
  'app_match',
  'wordpress_post',
  'dataset_key',
  'parent_key',
  'gbif_occurrence',
  'message_id',
  'in_reply_to',
  'page_id',
  'nostr',
  'uuid',
  'guid',
]);

/** Acronyms in fact keys, kept upper case in their label (`isrc` is in `FACT_FORMATS`). */
const LABEL_ACRONYMS: ReadonlySet<string> = new Set(['id', 'ids', 'url', 'iupac', 'doi', 'pdb', 'sku', 'cik']);

/** A fact key in words: `hiring_organization` → `Hiring organization`, `pdb_ids` → `PDB IDs`. */
export function getFactLabel(key: string): string {
  const known = FACT_FORMATS[key]?.label;
  if (known) return known;
  const words = key.split(/[_-]+/).filter(Boolean);
  const label = words
    .map((word, index) => {
      if (LABEL_ACRONYMS.has(word.toLowerCase())) return word === 'ids' ? 'IDs' : word.toUpperCase();
      return index === 0 ? capitalize(word) : word;
    })
    .join(' ');
  return label || key;
}

function formatFactValue(key: string, value: string, locale?: string): string {
  const unit = FACT_FORMATS[key]?.unit;
  const formatted = formatFactValueOnly(key, value, locale);
  // Only a number takes the unit: a value written with its own unit, or as words, stays as it is.
  return unit && /\d$/.test(formatted) ? `${formatted} ${unit}` : formatted;
}

function formatFactValueOnly(key: string, value: string, locale?: string): string {
  const format = FACT_FORMATS[key]?.format ?? (value.includes(LIST_SEPARATOR) ? 'list' : 'text');
  switch (format) {
    case 'date':
      return formatFactDate(value, locale) ?? value;
    case 'seconds':
      return formatDuration(value) ?? value;
    case 'minutes':
      return formatMinutes(value) ?? value;
    case 'count':
      return formatCount(value, locale) ?? value;
    case 'sats':
      return formatSats(value, locale) ?? value;
    case 'bool':
      return value === 'true' ? 'Yes' : value === 'false' ? 'No' : value;
    case 'country':
      return formatCountry(value, locale) ?? value;
    case 'language':
      return formatLanguage(value, locale) ?? value;
    case 'list':
      return formatList(value) ?? value;
    default:
      return value;
  }
}

/** One labelled fact on the resource page; `href` when the value is an `http(s)` link. */
export interface TResourceFactRow {
  key: string;
  label: string;
  value: string;
  href: string | null;
}

/**
 * Every fact of the card as a labelled row for the resource page's Details: known facts with their
 * label and format (`duration` 369 → `6:09`, `balance` → `57.71 BTC`), any other key in words with
 * its value as written (a list split, an `http(s)` value a link). Identifiers the card already
 * uses (`HIDDEN_FACTS`) and values that repeat the title are left out. Rows keep the order Pinakes
 * sends.
 *
 * @param locale - For tests; the viewer's locale when omitted
 */
export function getResourceFactRows(
  card: Pick<TResourceFactsCard, 'facts'> & { name?: string | null },
  locale?: string,
): TResourceFactRow[] {
  const name = card.name?.trim().toLowerCase();
  return Object.keys(card.facts ?? {}).flatMap((key) => {
    if (HIDDEN_FACTS.has(key)) return [];
    const value = getFact(card, key);
    // A value that is the title (a film's `title`) says nothing new.
    if (!value || value.toLowerCase() === name) return [];
    return [{ key, label: getFactLabel(key), value: formatFactValue(key, value, locale), href: getHttpUrl(value) }];
  });
}

/** OpenStreetMap at a point, zoomed to a street. */
function getMapUrl(point: { lat: number; lon: number }): string {
  const lat = point.lat.toFixed(5);
  const lon = point.lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

/**
 * The resource page's Details rows: where it is (address, OSM category, the point with a map
 * link), when, for a card outside the event family that has a time (a block's, a trial's), then
 * every fact (`getResourceFactRows`).
 *
 * @param withDates - The card's `start`/`end` are not already shown as an event's dates
 * @param locale - For tests; the viewer's locale when omitted
 */
export function getResourceDetailRows(
  card: Pick<
    TResourceFactsCard,
    'type' | 'type_path' | 'facts' | 'address' | 'category' | 'point' | 'start' | 'end'
  > & {
    name?: string | null;
  },
  { withDates }: { withDates: boolean },
  locale?: string,
): TResourceFactRow[] {
  const factRows = getResourceFactRows(card, locale);
  const rows: TResourceFactRow[] = [];
  const address = formatAddress(card.address, locale);
  if (address) rows.push({ key: 'address', label: 'Address', value: address, href: null });
  const category = formatCategory(card.category);
  if (category) rows.push({ key: 'category', label: 'Kind', value: category, href: null });
  if (card.point && Number.isFinite(card.point.lat) && Number.isFinite(card.point.lon)) {
    const value = `${card.point.lat.toFixed(4)}, ${card.point.lon.toFixed(4)}`;
    rows.push({ key: 'point', label: 'Map', value, href: getMapUrl(card.point) });
  }
  if (withDates) {
    // A day a date fact already names (a job's `date_posted`, an observation's `observed_on`) is not
    // listed twice: compared as shown, as the day the source wrote, and as its UTC day.
    const factDays = new Set(factRows.map((row) => row.value));
    const factDates = new Set(
      Object.values(card.facts ?? {}).flatMap((value) => {
        const day = typeof value === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(value.trim())?.[0] : undefined;
        return day ? [day] : [];
      }),
    );
    const isNamed = (value: string | null | undefined, shown: string | null) => {
      if (!shown) return true;
      // The day as the source wrote it (`2026-01-01T20:00:00-08:00`), then as its UTC day.
      const written = /^\d{4}-\d{2}-\d{2}/.exec(value?.trim() ?? '')?.[0];
      if (written && factDates.has(written)) return true;
      const date = value ? new Date(value) : null;
      const day = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
      return factDays.has(shown) || (day !== null && factDates.has(day));
    };
    const [startLabel, endLabel] = getNearestTypes(card)
      .map((type) => DATE_LABELS[type])
      .find(Boolean) ?? ['Start', 'End'];
    const start = formatFactDate(card.start, locale);
    const end = formatFactDate(card.end, locale);
    if (start && !isNamed(card.start, start)) rows.push({ key: 'start', label: startLabel, value: start, href: null });
    if (end && !isNamed(card.end, end)) rows.push({ key: 'end', label: endLabel, value: end, href: null });
  }
  const shown = new Set(rows.map((row) => row.key));
  return [...rows, ...factRows.filter((row) => !shown.has(row.key))];
}

/** What a card's `start` and `end` mean outside the event family, by type (nearest wins). */
const DATE_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  BitcoinBlock: ['Mined', 'End'],
  BitcoinTransaction: ['Confirmed', 'End'],
  Observation: ['Observed', 'End'],
  JobPosting: ['Posted', 'Closes'],
  MedicalTrial: ['Started', 'Completed'],
};
