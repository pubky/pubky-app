/**
 * Pinakes API shapes, hand-written from `GET <pinakes>/v1/openapi.json` (components `Card`,
 * `ResourceDetail` = `Card` + `Details`, `AlsoOn`, `OpenIn`, `GroupRef`, `GroupDetail`,
 * `SearchResponse`, `Facets`, `TypeFacet`, `Point`, `VenueRef`).
 *
 * `Card.credits` (`Credit`) is optional: not every Pinakes deployment sends it yet.
 *
 * Only the fields the app reads are typed; the API carries more (`bbox`, `from`, `maybe_same`,
 * `occurrence`, ...). Fields the schema lists as required are required here; every other field is
 * optional and nullable, as the schema declares it ("Absent values are null").
 * The captured responses in `./fixtures` are checked against these types in `pinakes.test.ts`.
 */

/**
 * The documented `status` values (`/llms.txt`, "What is in the index": "`status` is `ok`,
 * `pending`, `missing` (the object is gone upstream), `unreachable` or `error`"). Only `missing`
 * has a documented meaning; the others are named there without one. The schema types `status` as
 * a plain string, so a card may carry a value added later: treat anything else like `error`.
 */
export enum PinakesStatus {
  OK = 'ok',
  /** Undocumented. */
  PENDING = 'pending',
  /** "The object is gone upstream." */
  MISSING = 'missing',
  /** Undocumented beyond its name. */
  UNREACHABLE = 'unreachable',
  /** Undocumented. */
  ERROR = 'error',
}

/** `Point`: where a place (or an event's venue) is. */
export interface TPinakesPoint {
  lat: number;
  lon: number;
}

/** `VenueRef`: where an event takes place, by name. */
export interface TPinakesVenueRef {
  id?: string | null;
  /** Plain text: escape before rendering as HTML. */
  name?: string | null;
}

/** A place's postal address (`Details.address`, an open object): the parts Pinakes sends for OSM places. */
export interface TPinakesAddress {
  street?: string | null;
  house_number?: string | null;
  postcode?: string | null;
  city?: string | null;
  /** ISO 3166-1 alpha-2, in either case (`ch`, `US`). */
  country_code?: string | null;
}

/** `OrganizerRef`: who runs an event. */
export interface TPinakesOrganizerRef {
  /** Plain text. */
  name?: string | null;
  /** Not always `http(s)`. */
  url?: string | null;
}

/** `Stream`: audio a client can play, an episode's enclosure or a recording's public preview. */
export interface TPinakesStream {
  /** Not always `http(s)`: played only then. */
  url: string;
  /** A MIME type (`audio/mpeg`). */
  type: string;
  /** A short public preview, not the whole recording. */
  preview: boolean;
  duration_s?: number | null;
}

/** `GroupRef`: the group a card is in; its other members are in `also_on`. */
export interface TPinakesGroupRef {
  id: string;
  /** Members in the group, this one included. */
  size: number;
}

/** `AlsoOn`: the same thing on another service, a tagged group member or a derived link. */
export interface TPinakesAlsoOn {
  uri: string;
  /** A tagged member's resource ID; absent on a derived link. */
  id?: string | null;
  /** The service name. */
  site?: string | null;
  /**
   * For a tagged member, the links people wrote for it, as its own card's `refs` (at most 5); absent
   * when only `uri` was referenced, and never on a derived link.
   */
  refs?: string[] | null;
  /** A link nobody tagged, found by a source. */
  derived?: boolean;
  /** For a derived link, a qualifier (`archived`, `work`, `source`, `submitted`, `published`, `pdf`). */
  kind?: string | null;
  /** For a derived link, the hub or service it came through (`musicbrainz`, `wikidata`). */
  via?: string | null;
  /** For a derived link, a time that belongs to it (an archived copy's capture). RFC 3339. */
  at?: string | null;
}

/** The card fields a `Credit` names. A credit for any other field is ignored. */
export enum PinakesCreditField {
  IMAGE = 'image',
  DESCRIPTION = 'description',
}

/** The sources a `Credit` names by name. Any other provider is named by its `source_url` host. */
export enum PinakesCreditProvider {
  WIKIPEDIA = 'wikipedia',
  WIKIMEDIA_COMMONS = 'wikimedia_commons',
  /** A Wikidata item's one-line description (CC0). */
  WIKIDATA = 'wikidata',
}

/**
 * `Credit`: where an enriched card value (a Wikipedia text, a Wikimedia Commons image) comes from
 * and under which license. Pinakes shows an enriched value only with its credit.
 */
export interface TPinakesCredit {
  /** The card field it credits: one of `PinakesCreditField`, or a field added later. */
  field: string;
  /** One of `PinakesCreditProvider`, or a provider added later. */
  provider: string;
  /** The article or file page the value comes from. Not always `http(s)`: shown as a link only then. */
  source_url: string;
  /** Plain text. */
  author?: string | null;
  /** SPDX-style license id (`CC-BY-SA-4.0`) or `public-domain`. */
  license?: string | null;
  license_url?: string | null;
  /** The text's language (`en`); `null` for an image. */
  lang?: string | null;
  /** The text is cut from a longer source. */
  excerpted?: boolean;
  /** The value was changed from its source. */
  modified?: boolean;
  /** The entity the content is about, when it is another one (a song's text from its work's article). */
  subject?: string | null;
}

/** `OpenIn`: a client that opens a Pubky app's object, and the object's `https:` address there. */
export interface TPinakesOpenIn {
  client: string;
  url: string;
}

/**
 * `Because`: why a `related` search row is listed: the resource's taggers who also referenced the
 * row, as Pinakes ranked it.
 */
export interface TPinakesBecause {
  /** How many of them (the count the row is ranked by). */
  shared: number;
  /** Up to three of them (Pubky public keys), those who tagged the resource most recently first. */
  taggers: string[];
}

/** `Card`: the one card every route returns for a resource. */
export interface TPinakesCard {
  /** Pinakes's own resource ID (32 lowercase hex). Join with Nexus by URI, never by this ID. */
  id: string;
  /** The canonical link. Not always `http(s)`: `isbn:`, `doi:`, `osm:`, `pubky://`, ... */
  uri: string;
  /** One of `PinakesStatus`, or a value added after this client was written. */
  status: string;
  /** schema.org type (`VideoObject`, `MusicRecording`, ...). */
  type?: string | null;
  /** The type's ancestors, root first (`["Thing", "Event", "MusicEvent"]`). */
  type_path: string[];
  /** Plain text: escape before rendering as HTML. */
  name?: string | null;
  /** Plain text: escape before rendering as HTML. */
  description?: string | null;
  /** Not always `https:`: also `http:` and `pubky://`. Callers show only `http(s)` images. */
  image?: string | null;
  /** The publishing site or service (`OpenStreetMap`, `Wikipedia (de)`), else the host. */
  site?: string | null;
  point?: TPinakesPoint | null;
  /** RFC 3339. */
  start?: string | null;
  /** RFC 3339. */
  end?: string | null;
  /** The credit to show with OpenStreetMap cards and events placed from OSM data. */
  attribution?: string | null;
  group?: TPinakesGroupRef | null;
  also_on: TPinakesAlsoOn[];
  open_in: TPinakesOpenIn[];
  /** On a `related` search row only (absent elsewhere and on older instances): why it is listed. */
  because?: TPinakesBecause | null;
  /** The referenced links that resolve to this card, most referenced first (at most 5). */
  refs: string[];
  /** How many public collection posts hold the card's link. */
  collections: number;
  /**
   * Where the card's enriched values come from. Absent on stable, and absent, `null` and `[]` mean
   * the same: nothing is credited. `PinakesApplication` drops malformed entries
   * (`withNormalizedCredits`).
   */
  credits?: TPinakesCredit[] | null;
}

/** `ResourceDetail`: a resource read (`by-uri`, `resources/{id}`), the card plus `Details`. */
export interface TPinakesResourceDetail extends TPinakesCard {
  /** Other spellings of this link that resolve to it (at most 50). */
  aliases: string[];
  /** The public identifiers this resource is keyed by (`isbn:…`, `doi:…`, `osm:node/…`). */
  keys: string[];
  /** IANA time zone of an event (`America/Chicago`). */
  tz?: string | null;
  all_day?: boolean | null;
  venue?: TPinakesVenueRef | null;
  /** The event's status as the source gives it (`scheduled`); undocumented, so shown as written. */
  event_status?: string | null;
  updated_at?: string | null;
  /**
   * What the source says about the object, by name (`duration` in seconds, `artist`, `stars`,
   * `price`, ...; docs/api.md and each source's page); every value a string, several joined with
   * `"; "`. `null` when there are none.
   */
  facts?: Record<string, string> | null;
  address?: TPinakesAddress | null;
  /** An OSM place's `key/value` tag (`amenity/cafe`). */
  category?: string | null;
  organizer?: TPinakesOrganizerRef | null;
  /** How an event is attended: `offline`, `online` or `mixed` as the source gives it. */
  attendance?: string | null;
  stream?: TPinakesStream | null;
}

/** `GroupDetail`: `GET /v1/groups/{id}`, every member's own card. */
export interface TPinakesGroupDetail {
  id: string;
  /** An operator set the members. */
  curated: boolean;
  /** The identifiers two or more members share. */
  keys: string[];
  members: TPinakesCard[];
  /** The type most members have. */
  type?: string | null;
}

/** `TypeFacet`: one card type and where it sits in schema.org. */
export interface TPinakesTypeFacet {
  type: string;
  type_path: string[];
  count: number;
}

/** `SearchResponse`: `GET /v1/search` (without `cluster`). */
export interface TPinakesSearchResponse {
  items: TPinakesCard[];
  cursor?: string | null;
  reach_truncated: boolean;
  facets?: { type?: TPinakesTypeFacet[] | null } | null;
}
