import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { getUrlHostLabel } from '@/libs/utils/urlToIcon';
import { PinakesStatus, type TPinakesCard, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceFamily } from './ResourceCard.types';

/**
 * schema.org types whose cards carry extra details, nearest ancestor wins (see `getResourceFamily`).
 * A family is a group of types, never one type: every type below `Event` or `Place` in a card's
 * `type_path` gets that family's details, whatever Pinakes adds later.
 */
const FAMILY_ANCESTORS: Readonly<Record<string, ResourceFamily>> = {
  Event: ResourceFamily.EVENT,
  Place: ResourceFamily.PLACE,
};

/** A schema.org media type ends in `Object` (`VideoObject`, `ImageObject`); the label drops it. */
const MEDIA_OBJECT_SUFFIX = /(?<=.)Object$/;

/** Splits CamelCase into words and keeps acronyms whole: `FAQPage` → `FAQ Page`, `TVSeries` → `TV Series`. */
const CAMEL_CASE_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g;

/**
 * The word people use for a type, where it is not the schema.org name in words (`Song`, not
 * `Music recording`) or is pinned on purpose (`Movie`, never "film"): the card's badge and its
 * tag bar both say it.
 */
const TYPE_LABEL_WORDS: Readonly<Record<string, string>> = {
  MusicRecording: 'Song',
  MusicAlbum: 'Album',
  MusicGroup: 'Artist',
  Movie: 'Movie',
  TVSeries: 'TV series',
};

/**
 * The card's type in plain words, from its schema.org `type` (else the deepest `type_path` entry):
 * `MusicRecording` → `Song`, `VideoObject` → `Video`, `FAQPage` → `FAQ page`. `null` when the card
 * has no type. Every place that names a card's type reads it here, so they all say the same word.
 */
export function getResourceTypeLabel(card: Pick<TPinakesCard, 'type' | 'type_path'>): string | null {
  const type = card.type || card.type_path.at(-1);
  if (!type) return null;
  // Own keys only: a type such as `constructor` must not read a built-in property of the object.
  const word = Object.hasOwn(TYPE_LABEL_WORDS, type) ? TYPE_LABEL_WORDS[type] : undefined;
  if (word) return word;

  const words = type.replace(MEDIA_OBJECT_SUFFIX, '').split(CAMEL_CASE_BOUNDARY);
  return words
    .map((word, index) => {
      // An acronym (`FAQ`, `TV`) keeps its case; every other word after the first is lower case.
      if (index === 0 || /^[A-Z0-9]+$/.test(word)) return word;
      return word.toLowerCase();
    })
    .join(' ');
}

/**
 * Which details a card shows, from the nearest ancestor in its `type_path` that has a family
 * (`Restaurant` → `LocalBusiness` → `Place`). Types with no such ancestor are plain web cards.
 */
export function getResourceFamily(card: Pick<TPinakesCard, 'type' | 'type_path'>): ResourceFamily {
  const path = card.type && card.type_path.at(-1) !== card.type ? [...card.type_path, card.type] : card.type_path;
  for (let index = path.length - 1; index >= 0; index--) {
    const family = FAMILY_ANCESTORS[path[index]];
    if (family) return family;
  }
  return ResourceFamily.WEB;
}

/** The card's `status` as one the card knows how to show: an unknown value reads as `error`. */
export function getResourceStatus(status: string): PinakesStatus {
  const known = Object.values(PinakesStatus).find((value) => value === status);
  return known ?? PinakesStatus.ERROR;
}

/**
 * `value` when it is an `http:` or `https:` URL, else `null`. Only these may become an `href` or an
 * image `src`: Pinakes URIs can be `isbn:`, `doi:`, `pubky://`, and a stored value could be anything.
 * A link that carries a username or password (`user:password@`) is `null` too: the card never opens
 * or reads it (the link stays in the post's text as written).
 */
export function getHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = getSafeExternalUrl(value);
  if (!url) return null;
  const { protocol, username, password } = new URL(url);
  return (protocol === 'http:' || protocol === 'https:') && !username && !password ? url : null;
}

/** A link without its scheme and `www.`, for a card that has no name: `https://www.x.com/a` → `x.com/a`. */
export function getDisplayLink(value: string): string {
  return value.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, '').replace(/^www\./i, '');
}

/**
 * schema.org types whose `image` is a 16:9 frame (a video still, a movie's or series' backdrop):
 * the card shows it as a 16:9 thumbnail, where a square crop would cut it (and any text in it).
 * Every other card (music, books, places, articles) keeps the square.
 */
const WIDE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'VideoObject',
  'Clip',
  'Movie',
  'MovieSeries',
  'TVSeries',
  'TVSeason',
  'TVEpisode',
]);

/** Whether the card's image is a 16:9 frame, from its `type` or any `type_path` entry. */
export function hasWideImage(card: Pick<TPinakesCard, 'type' | 'type_path'>): boolean {
  return (card.type ? [card.type, ...card.type_path] : card.type_path).some((type) => WIDE_IMAGE_TYPES.has(type));
}

/**
 * The tag bar's label, naming what is tagged with the card's type label (`getResourceTypeLabel`, the
 * badge's words): "Tags on this song", "Tags on this video", "Tags on this FAQ page". Without a
 * type (no card, or an untyped one) it is "Tags on the external resource".
 */
export function getResourceTagsLabel(card: Pick<TPinakesCard, 'type' | 'type_path'> | null | undefined): string {
  const typeLabel = card ? getResourceTypeLabel(card) : null;
  if (!typeLabel) return 'Tags on the external resource';
  const [first, ...rest] = typeLabel.split(' ');
  // An acronym (`FAQ`, `TV`) keeps its case mid-sentence; any other first word reads in lower case.
  const lead = /^[A-Z0-9]{2,}$/.test(first) ? first : first.charAt(0).toLowerCase() + first.slice(1);
  return `Tags on this ${[lead, ...rest].join(' ')}`;
}

/** Controls a click on the card must reach, not the card's click-through. */
const CARD_CONTROL_SELECTOR =
  'a, button, input, textarea, select, label, [role="button"], [role="menuitem"], [data-resource-controls]';

/**
 * Whether a click on a card lands on the card itself rather than on one of its controls: not a
 * link, button, field or menu item, not inside the card's action row or tag bar, and not in a
 * portal (a menu or dialog the card opened, whose events bubble through the React tree).
 */
export function isCardSurfaceClick(card: Element, target: EventTarget | null): boolean {
  if (!(target instanceof Element) || !card.contains(target)) return false;
  return !target.closest(CARD_CONTROL_SELECTOR);
}

/** The host of an `http(s)` link without `www.` (`getUrlHostLabel`), else `null`. */
export function getLinkHost(value: string | null | undefined): string | null {
  const url = getHttpUrl(value);
  return url ? getUrlHostLabel(url) : null;
}

/** `https://<host>/favicon.ico` for an `http(s)` link, else `null` (non-web URIs have no site to ask). */
export function getFaviconUrl(value: string | null | undefined): string | null {
  const url = getHttpUrl(value);
  return url ? `${new URL(url).origin}/favicon.ico` : null;
}

/**
 * Where a card leads and whose site it names, shared by the card and its ⋯ menu:
 *
 * - `linkUrl`: the post's link first (what the author wrote), then the card's own link, then the
 *   address Pinakes gives for a Pubky app's object (`open_in`), then the first web link people
 *   wrote for it (`refs`, most referenced first), such as a `btc:` or `isbn:` card's page; never a
 *   non-web URI.
 * - `sourceUri`: what the source's favicon is read from: the card's own link when that is web, else
 *   `linkUrl`; not an alias the post may use (a short link, a mobile host), since the source names
 *   the card's site.
 * - `siteName`: the card's `site`, else the host of `sourceUri` without `www.`.
 */
export function getResourceLinks(
  card: Pick<TPinakesCard, 'uri' | 'site' | 'open_in' | 'refs'>,
  href?: string,
): { linkUrl: string | null; sourceUri: string; siteName: string | null } {
  const linkUrl =
    getHttpUrl(href) ??
    getHttpUrl(card.uri) ??
    getHttpUrl(card.open_in[0]?.url) ??
    card.refs.map(getHttpUrl).find((url) => url !== null) ??
    null;
  const sourceUri = getHttpUrl(card.uri) ?? linkUrl ?? card.uri;
  return { linkUrl, sourceUri, siteName: card.site || getLinkHost(sourceUri) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `event_status` of an event going ahead as planned, as Pinakes sends it. */
const SCHEDULED_EVENT_STATUS = 'scheduled';

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createDateFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    // An unknown IANA zone is a RangeError: show the time in the viewer's own zone instead.
    const inViewerZone = { ...options };
    delete inViewerZone.timeZone;
    delete inViewerZone.timeZoneName;
    return new Intl.DateTimeFormat(locale, inViewerZone);
  }
}

/**
 * When an event happens, in the viewer's locale: in the event's time zone with its name when the
 * card has `tz`, else in the viewer's zone. All-day events show dates only, read in UTC with `end`
 * exclusive, as Pinakes encodes calendar occurrences (`00:00Z` → next day's `00:00Z`), so a
 * one-day event shows its date alone. `null` without a valid `start`.
 *
 * @param locale - For tests; the viewer's locale when omitted
 */
export function formatResourceDates(
  card: Pick<TPinakesResourceDetail, 'start' | 'end' | 'tz' | 'all_day'>,
  locale?: string,
): string | null {
  const start = parseDate(card.start);
  if (!start) return null;
  const end = parseDate(card.end);

  if (card.all_day) {
    const format = createDateFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const lastDay = end ? new Date(end.getTime() - DAY_MS) : null;
    if (!lastDay || lastDay.getTime() <= start.getTime()) return format.format(start);
    return format.formatRange(start, lastDay);
  }

  const format = createDateFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(card.tz ? { timeZone: card.tz, timeZoneName: 'short' } : {}),
  });
  if (!end || end.getTime() <= start.getTime()) return format.format(start);
  return format.formatRange(start, end);
}

/**
 * The note for an event that is not going ahead as planned: its `event_status` as written. `null`
 * for `scheduled` or no status.
 */
export function getEventStatusNote(eventStatus: string | null | undefined): string | null {
  const value = eventStatus?.trim();
  if (!value || value.toLowerCase() === SCHEDULED_EVENT_STATUS) return null;
  return `Event status: ${value}`;
}

/** A point as `lat, lon` in degrees, four decimals (about 10 m). */
export function formatResourcePoint(point: { lat: number; lon: number }): string {
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}
