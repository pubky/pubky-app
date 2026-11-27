import { getResourceRoute } from '@/app/routes';
import { foldWebLink, isExternalParentUri } from '@/libs/post/externalParent';
import { getIdentifierPage, removeTracking } from '@/libs/post/linkRules';
import { getPubkyAppTarget } from '@/libs/pubkyApp/pubkyAppTarget';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { getUrlHostLabel } from '@/libs/utils/urlToIcon';
import { getEventLifecycleLabel } from '@/pipes/resource/resource.events';
import {
  PinakesStatus,
  type TPinakesAlsoOn,
  type TPinakesCard,
  type TPinakesEpisode,
  type TPinakesResourceDetail,
  type TPinakesStream,
} from '@/services/pinakes/pinakes.types';
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

/** The one other type word: a site's own object as Pinakes titles it ("Post on x.com"), for `getShapeWord`. */
const SHAPE_WORDS: Readonly<Record<string, string>> = {
  SocialMediaPosting: 'post',
  VideoObject: 'video',
  Person: 'profile',
};

/** What a card of a site's own object is, as Pinakes titles it (`post`, `video`, `profile`; nearest type wins), else `null`. */
export function getShapeWord(card: Pick<TPinakesCard, 'type' | 'type_path'>): string | null {
  return (
    getNearestTypes(card)
      .map((type) => (Object.hasOwn(SHAPE_WORDS, type) ? SHAPE_WORDS[type] : undefined))
      .find(Boolean) ?? null
  );
}

/**
 * The card's type in plain words, from its schema.org `type` (else the deepest `type_path` entry):
 * `MusicRecording` → `Song`, `VideoObject` → `Video`, `FAQPage` → `FAQ page`. `null` when the card
 * has no type. Every place that names a card's type reads it here, so they all say the same word
 * (but for a site's own object named as Pinakes titles it, `getShapeWord`).
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

/** The card's types, nearest first: its `type`, then `type_path` from the deepest. */
export function getNearestTypes(card: Pick<TPinakesCard, 'type' | 'type_path'>): string[] {
  const path = [...card.type_path].reverse();
  return card.type && path[0] !== card.type ? [card.type, ...path] : path;
}

/**
 * schema.org types whose `image` is cover art: a song's, an album's or release's, a playlist's (`MusicAlbum` and
 * `MusicRelease` are playlists in schema.org). An artist (`MusicGroup`, `Person`) has a photo, not a cover.
 */
const COVER_ART_TYPES: ReadonlySet<string> = new Set(['MusicRecording', 'MusicPlaylist', 'MusicAlbum', 'MusicRelease']);

/**
 * Whether the card's image is cover art (`COVER_ART_TYPES`), from its `type` or any `type_path` entry: from a
 * YouTube thumbnail, such a cover shows as the thumbnail's middle square (`ResourceCardCover`'s `square`).
 */
export function hasCoverArt(card: Pick<TPinakesCard, 'type' | 'type_path'>): boolean {
  return getNearestTypes(card).some((type) => COVER_ART_TYPES.has(type));
}

/**
 * schema.org types whose `image` is mostly a 16:9 frame (a video's still; a film's or series' image is often wide):
 * the card's thumbnail is 16:9 before the image loads, where a square crop would cut it (and any text in it). Every
 * other card (music, books, places, articles) starts square; the loaded image's own shape decides after that. The
 * Video kind's types of `getPlayerCategory`, and `Clip` (kept here: the player's utils read this module).
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

/** Whether the card's image is a 16:9 frame (`WIDE_IMAGE_TYPES`), from its `type` or any `type_path` entry. */
export function hasWideImage(card: Pick<TPinakesCard, 'type' | 'type_path'>): boolean {
  return getNearestTypes(card).some((type) => WIDE_IMAGE_TYPES.has(type));
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

/** The `http(s)` audio a `stream` plays, else `null` (a video, a link that is not `http(s)`). */
export function getAudioStreamUrl(stream: TPinakesStream | null | undefined): string | null {
  return stream?.type?.startsWith('audio/') ? getHttpUrl(stream.url) : null;
}

/** One of a show's latest episodes that plays here, with the audio it plays. */
export interface TPlayableEpisode {
  episode: TPinakesEpisode;
  audioUrl: string;
}

/** A show's latest episodes (`episodes`) that play here (`getAudioStreamUrl`), newest first. */
export function getPlayableEpisodes(card: Partial<Pick<TPinakesResourceDetail, 'episodes'>>): TPlayableEpisode[] {
  return (card.episodes ?? []).flatMap((episode) => {
    const audioUrl = getAudioStreamUrl(episode.stream);
    return audioUrl ? [{ episode, audioUrl }] : [];
  });
}

/** The id of a show's Episodes section on its resource page: a show card's "All episodes" opens it. */
export const EPISODES_ANCHOR = 'episodes';

/**
 * The show a podcast episode is from, as Pinakes names it (`related` entry `show`: the show's feed and
 * title), or `null` when the card names none.
 */
export function getEpisodeShow(
  card: Partial<Pick<TPinakesResourceDetail, 'related'>>,
): { uri: string; name: string | null } | null {
  const show = card.related?.find((entry) => entry.rel === 'show' && entry.uri);
  return show?.uri ? { uri: show.uri, name: show.name?.trim() || null } : null;
}

/**
 * Whether the card plays whole in the app's own audio player: its own audio that is no preview (a
 * podcast episode's enclosure, an audio file Pinakes read), or a show's latest episodes. A
 * recording's public preview is not.
 */
export function playsInCard(card: Partial<Pick<TPinakesResourceDetail, 'stream' | 'episodes'>>): boolean {
  if (card.stream && !card.stream.preview && getAudioStreamUrl(card.stream)) return true;
  return getPlayableEpisodes(card).length > 0;
}

/** The host of an `http(s)` link without `www.` (`getUrlHostLabel`), else `null`. */
export function getLinkHost(value: string | null | undefined): string | null {
  const url = getHttpUrl(value);
  return url ? getUrlHostLabel(url) : null;
}

/**
 * `https://<host>/favicon.ico` for an `http(s)` link, else `null` (non-web URIs have no site to ask).
 * Always `https:`: the app is served over `https:`, where an `http:` image is mixed content.
 */
export function getFaviconUrl(value: string | null | undefined): string | null {
  const url = getHttpUrl(value);
  return url ? `https://${new URL(url).hostname}/favicon.ico` : null;
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

/** A web link with credentials (`https://user:pw@host`). */
const CREDENTIALS = /^https?:\/\/[^/?#]*@/i;

/** Other spellings of a link read along with it, at most. */
export const MAX_LINK_SPELLINGS = 5;

/**
 * Whether the page may tag, save or reply to `uri` as written: a URI a post can name as its parent
 * (`isExternalParentUri`), but not a web link with credentials (`https://user:pw@host`), which such a
 * public write would publish.
 */
export function isWritableResourceUri(uri: string): boolean {
  return isExternalParentUri(uri) && !CREDENTIALS.test(uri);
}

/**
 * `link` as a web link the app writes, or `null` when it is none: folded the way every writer stores
 * it (`foldWebLink`: no credentials, no fragment, scheme and host in lower case), whatever else reads it,
 * and without the query parameters Pinakes drops as tracking (`removeTracking`), so a public write never
 * carries the sharer's tracking id.
 */
function getWebWriteUri(link: string | null | undefined): string | null {
  const folded = link ? foldWebLink(link) : null;
  return folded ? removeTracking(folded) : null;
}

/** The page Pinakes gives for a card whose own link is no web link, when the app may write it. */
function getOpenInWriteUri(card: Pick<TPinakesCard, 'uri'> & Partial<Pick<TPinakesCard, 'open_in'>>): string | null {
  // A Pubky object's address is its own: no page stands in for it.
  if (getWebWriteUri(card.uri) || card.uri.startsWith('pubky://')) return null;
  return getOpenableWriteUri(card.open_in?.[0]?.url);
}

/** A web link of a card the app writes (`getWebWriteUri`) that a browser can open too, else `null`. */
function getOpenableWriteUri(link: string | null | undefined): string | null {
  const uri = getWebWriteUri(link);
  return uri && getHttpUrl(uri) ? uri : null;
}

/**
 * The link a card's tags, replies, saves and counts are written to (`uri`), and the other spellings
 * read along as the same link's (`spellings`): Nexus keeps each spelling apart, Pinakes folds them
 * into one card.
 *
 * `uri` is the same whether a Pinakes answered or not, and whichever did:
 * - the link as written (a post's link, a pasted link, a link's page) when it is a web link, folded
 *   the way every writer stores it (`foldWebLink`) and without its tracking parameters
 *   (`removeTracking`); never the card's own link instead, which Pinakes may have from a fetch
 *   (`rel=canonical`, a redirect);
 * - else (a search row of an identifier, the identifier's own page) the identifier's page as Pinakes
 *   publishes it (`getIdentifierPage`: `wikidata:`, `isbn:`, `doi:`, `btc:`, a source's own scheme, …),
 *   from the card's `uri` (without a card, the identifier as written), built into the app;
 * - for an identifier with no such page (`mbid:`, `imdb:`, `upc:`, `gtin:`, `podcast:…`), a web link of
 *   the card: its own `uri`, the first web link people wrote for it (`refs`, where their tags are),
 *   the page Pinakes gives for it (`open_in`). A Pubky object's `pubky://` address is its own,
 *   readable by any client: no other link stands in for it;
 * - with no such link, the card's `uri` when the app can write it (`isExternalParentUri`), else the
 *   link as written.
 *
 * `spellings` are the card's `uri` when it is not `uri` (first, so tags already on it keep showing),
 * then that page (`open_in`), the link as written, the page of the identifier as written (where it
 * was written before its card was known), the card's `refs` and `aliases`: each once, at most
 * `MAX_LINK_SPELLINGS`, never one with credentials. Without a card, the link as written when the fold
 * or its page changed it.
 */
export function getResourceTarget(
  card:
    | (Pick<TPinakesCard, 'uri' | 'refs'> &
        Partial<Pick<TPinakesCard, 'open_in'>> &
        Partial<Pick<TPinakesResourceDetail, 'aliases'>>)
    | null
    | undefined,
  written: string,
): { uri: string; spellings: string[] } {
  const asWritten = getWebWriteUri(written);
  // A spelling with credentials is never read along: they would go out with the read.
  const readable = (link: string, uri: string) => Boolean(link) && link !== uri && !CREDENTIALS.test(link);
  if (!card) {
    const uri = asWritten ?? getWebWriteUri(getIdentifierPage(written)) ?? written;
    return { uri, spellings: [written].filter((link) => readable(link, uri)) };
  }
  const known = card.uri.startsWith('pubky://') ? [] : [card.uri, ...card.refs];
  const uri =
    asWritten ??
    getWebWriteUri(getIdentifierPage(card.uri)) ??
    known.map(getOpenableWriteUri).find((link) => link !== null) ??
    getOpenInWriteUri(card) ??
    (isExternalParentUri(card.uri) || !isExternalParentUri(written) ? (getWebWriteUri(card.uri) ?? card.uri) : written);
  const page = getOpenInWriteUri(card);
  // The page written for the identifier before its card was known.
  const writtenPage = getWebWriteUri(getIdentifierPage(written));
  const spellings = [
    ...new Set([
      card.uri,
      ...(page ? [page] : []),
      written,
      ...(writtenPage ? [writtenPage] : []),
      ...card.refs,
      ...(card.aliases ?? []),
    ]),
  ].filter((link) => readable(link, uri));
  return { uri, spellings: spellings.slice(0, MAX_LINK_SPELLINGS) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createDateFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    // An unknown IANA zone is a RangeError: show the time in UTC instead, named as any zone is.
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  }
}

/**
 * When an event happens, in the viewer's locale: in the event's time zone when the card has `tz`,
 * else in UTC (a search row and a calendar occurrence say no zone), always with the zone's name.
 * Never in the viewer's own zone, which would show another time without saying whose. Events the
 * card says are `all_day` (never inferred from their times) show dates only, read in UTC with `end`
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
    timeZone: card.tz || 'UTC',
    timeZoneName: 'short',
  });
  if (!end || end.getTime() <= start.getTime()) return format.format(start);
  return format.formatRange(start, end);
}

/** The id of a date page's Other dates section: an event card's "Other dates · N" opens the page there. */
export const OTHER_DATES_ANCHOR = 'other-dates';

/**
 * What an event card says of its series' other coming dates (`useEventDates`, by start): how many,
 * `N+` when the feed has more than one read (`hasMore`), and the day of the next one after the card's
 * own date (`after`, its start), in that date's time zone (`Other dates · 9 · next Wed, Dec 23`); the
 * count alone when none comes after it. `null` with no other date.
 */
export function formatOtherDates(
  dates: readonly Pick<TPinakesResourceDetail, 'start' | 'tz' | 'all_day'>[],
  hasMore: boolean,
  after?: string | null,
  locale?: string,
): string | null {
  if (dates.length === 0) return null;
  const count = `Other dates\u00a0·\u00a0${dates.length}${hasMore ? '+' : ''}`;
  const own = parseDate(after)?.getTime() ?? -Infinity;
  const next = dates.find((date) => (parseDate(date.start)?.getTime() ?? -Infinity) > own);
  const start = parseDate(next?.start);
  if (!next || !start) return count;
  const day = createDateFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: next.all_day ? 'UTC' : next.tz || 'UTC',
  }).format(start);
  return `${count} · next ${day}`;
}

/**
 * The note for an event that is not going ahead as planned: a lifecycle Pinakes names in words
 * (`Cancelled`, `Moved online`: `getEventLifecycleLabel`, as a calendar's list of dates says it),
 * any other `event_status` as written. `null` for `scheduled` or no status.
 */
export function getEventStatusNote(eventStatus: string | null | undefined): string | null {
  return getEventLifecycleLabel(eventStatus, (value) => `Event status: ${value}`);
}

/** A point as `lat, lon` in degrees, four decimals (about 10 m). */
export function formatResourcePoint(point: { lat: number; lon: number }): string {
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

/** The `kind` of a derived link that is an archived copy; its `at` is the capture. */
const ARCHIVED_KIND = 'archived';

/** A documented `kind` whose plain wording is not its value with a capital: an acronym. */
const KIND_LABELS: Readonly<Record<string, string>> = { pdf: 'PDF' };

/** The `kind` of a derived link Pinakes matched by metadata, not by an exact ID: possibly the same thing. */
const MAYBE_KIND = 'maybe';

/**
 * What a match by metadata (`isMaybeAlsoOn`) says, everywhere it is listed: in its hover text and its
 * accessible name only, never shown as a label.
 */
export const MAYBE_ALSO_ON_NOTE = 'Matched by title and length';

/**
 * Whether an Also on entry is a match by metadata (`kind: "maybe"`: the same title, artist and length),
 * not an exact link: it is listed after the exact links with `MAYBE_ALSO_ON_NOTE` in its hover text and
 * name, and is never a card's default player while an exact link has one (the viewer can still pick it).
 */
export function isMaybeAlsoOn(entry: Pick<TPinakesAlsoOn, 'kind'>): boolean {
  return entry.kind?.trim().toLowerCase() === MAYBE_KIND;
}

/** The name of an Also on entry: its service, else the link's host, else the link as written. */
export function getAlsoOnName(entry: Pick<TPinakesAlsoOn, 'uri' | 'site'>): string {
  return entry.site?.trim() || getLinkHost(entry.uri) || getDisplayLink(entry.uri);
}

/**
 * The app a Pubky object belongs to, from its path (`pubky://<key>/pub/loopky/decks/…` → `loopky`),
 * to name the object by when there is no card for it: its path is no name. `null` for any other URI.
 */
export function getPubkyObjectApp(uri: string): string | null {
  return /^pubky:\/\/[^/]+\/pub\/([^/]+)\//.exec(uri)?.[1] ?? null;
}

/**
 * Where an Also on entry opens: the link's resource page, a pubky.app post's or profile's own page,
 * a pubky.app file's page (`getResourceRoute`); `null` for another Pubky app's object, which the app
 * has no page for.
 */
export function getAlsoOnRoute(uri: string): string | null {
  if (getPubkyAppTarget(uri)) return getResourceRoute(uri);
  return uri.startsWith('pubky:') ? null : getResourceRoute(uri);
}

/**
 * The identifier of an entry that is not a web link, shown after its name (`doi:10.1038/nature12373`
 * named "DOI"); `null` for a web link or when it is the name already. Kept as written: case can matter.
 */
export function getAlsoOnIdentifier(entry: Pick<TPinakesAlsoOn, 'uri' | 'site'>): string | null {
  if (getHttpUrl(entry.uri)) return null;
  const identifier = getDisplayLink(entry.uri);
  return identifier !== getAlsoOnName(entry) ? identifier : null;
}

/**
 * What an Also on entry says under its name: its identifier (`getAlsoOnIdentifier`), an archived
 * copy with its capture date (in UTC, as archives date them), another qualifier (`kind`), and for a
 * derived link the source it was found through. `null` for a tagged web link without a qualifier.
 * A match by metadata says how it was found (`MAYBE_ALSO_ON_NOTE`) with its source only.
 *
 * @param locale - For tests; the viewer's locale when omitted
 * @param options.withSource - `false` leaves out where and how a derived link was found
 */
export function getAlsoOnNote(
  entry: Pick<TPinakesAlsoOn, 'uri' | 'site' | 'derived' | 'kind' | 'via' | 'at'>,
  locale?: string,
  { withSource = true }: { withSource?: boolean } = {},
): string | null {
  const parts: string[] = [];
  const kind = entry.kind?.trim();
  if (isMaybeAlsoOn(entry)) {
    if (withSource) parts.push(MAYBE_ALSO_ON_NOTE);
  } else if (kind?.toLowerCase() === ARCHIVED_KIND) {
    const at = parseDate(entry.at);
    parts.push(
      at ? `Archived ${createDateFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(at)}` : 'Archived',
    );
  } else if (kind) {
    parts.push(KIND_LABELS[kind.toLowerCase()] ?? kind);
  }
  if (entry.derived && withSource) {
    const via = entry.via?.trim();
    parts.push(via ? `found via ${via}` : 'found automatically');
  }
  const qualifier = parts.length > 0 ? parts.join(' · ') : null;
  const note = qualifier && qualifier.charAt(0).toUpperCase() + qualifier.slice(1);

  const identifier = getAlsoOnIdentifier(entry);
  if (identifier) return note ? `${identifier} · ${note}` : identifier;
  return note;
}

/**
 * The note under another resource in a list: its type in plain words and its site, else the host of
 * its own web link (not `open_in`, as a row names the card's own link only). `null` when it has neither.
 */
export function getResourceListNote(card: Pick<TPinakesCard, 'uri' | 'type' | 'type_path' | 'site'>): string | null {
  const parts = [getResourceTypeLabel(card), card.site?.trim() || getLinkHost(card.uri)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
