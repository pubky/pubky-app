import {
  PinakesCreditField,
  PinakesCreditProvider,
  type TPinakesCard,
  type TPinakesCredit,
} from '@/services/pinakes/pinakes.types';
import { getHttpUrl, getLinkHost } from './ResourceCard.utils';

/** The fields a credit can name, in the order the credits are listed. */
const CREDITED_FIELDS: readonly string[] = [PinakesCreditField.DESCRIPTION, PinakesCreditField.IMAGE];

/**
 * A card's map data: OpenStreetMap, credited by Pinakes in the card's `attribution` (a place, an
 * event placed from its data, a time zone from its boundaries). Not a Pinakes credit: the resource
 * page names it once under Sources (`getMapDataCredit`), never on every card.
 */
const MAP_DATA_FIELD = 'map';
const MAP_DATA_PROVIDER = 'openstreetmap';
/** OpenStreetMap's page on its licence and how to credit it. */
const MAP_DATA_URL = 'https://www.openstreetmap.org/copyright';
/** A part of an `attribution` that credits OpenStreetMap data. */
const MAP_DATA_ATTRIBUTION = /openstreetmap/i;

/** What each credited field is called on a credit line. */
export const CREDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  [PinakesCreditField.DESCRIPTION]: 'Text',
  [PinakesCreditField.IMAGE]: 'Image',
  [MAP_DATA_FIELD]: 'Map data',
};

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  [PinakesCreditProvider.WIKIPEDIA]: 'Wikipedia',
  [PinakesCreditProvider.WIKIMEDIA_COMMONS]: 'Wikimedia Commons',
  [PinakesCreditProvider.WIKIDATA]: 'Wikidata',
  [MAP_DATA_PROVIDER]: 'OpenStreetMap',
};

/** `CC-BY-SA-4.0` → `BY-SA`, `4.0`. */
const CREATIVE_COMMONS_LICENSE = /^CC-([A-Z]+(?:-[A-Z]+)*)-(\d+(?:\.\d+)?)$/i;

/** `CC0-1.0` → `1.0`. */
const CC0_LICENSE = /^CC0-(\d+(?:\.\d+)?)$/i;

const PUBLIC_DOMAIN = 'public-domain';

/**
 * An `attribution` part no licence asks to show: a CC0 work or a Public Domain Mark. A file marked
 * "public domain" keeps its credit: on Wikimedia Commons that can depend on the country.
 */
const NO_CREDIT_ATTRIBUTION = /\bCC0\b|\bpublic domain mark\b/i;

/** Public-domain sources Pinakes credits by name alone (U.S. government data). */
const PUBLIC_DOMAIN_SOURCES: ReadonlySet<string> = new Set(['PubChem (NCBI)', 'U.S. Geological Survey']);

/**
 * The credits a card shows: one per enriched value it shows, the text's first. A credit for a
 * field the card has no value for (or whose image did not load), or for a field this app does not
 * show, is left out. Absent, `null` and `[]` credits are all none.
 */
export function getShownCredits(
  card: Pick<TPinakesCard, 'credits' | 'description'>,
  { imageShown }: { imageShown: boolean },
): TPinakesCredit[] {
  const shown = (credit: TPinakesCredit) =>
    credit.field === PinakesCreditField.DESCRIPTION ? Boolean(card.description) : imageShown;
  return (card.credits ?? [])
    .filter((credit) => CREDITED_FIELDS.includes(credit.field) && shown(credit))
    .sort((a, b) => CREDITED_FIELDS.indexOf(a.field) - CREDITED_FIELDS.indexOf(b.field));
}

/** An `attribution` in its parts: Pinakes joins a place's and a time zone's credit with `; `. */
function getAttributionParts(attribution: string | null | undefined): string[] {
  return (attribution ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The `attribution` a card shows itself: every credit but OpenStreetMap's, which the resource page
 * names once under Sources instead (`getMapDataCredit`), and those no licence asks for (CC0, public
 * domain: RCSB PDB, ROR, PubChem). `null` when none is left.
 */
export function getCardAttribution(attribution: string | null | undefined): string | null {
  const parts = getAttributionParts(attribution).filter(
    (part) => !MAP_DATA_ATTRIBUTION.test(part) && !NO_CREDIT_ATTRIBUTION.test(part) && !PUBLIC_DOMAIN_SOURCES.has(part),
  );
  return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * The Sources line of a card whose `attribution` credits OpenStreetMap: "Map data: OpenStreetMap",
 * linked to OpenStreetMap's copyright page (its licence and terms). `null` for any other card.
 */
export function getMapDataCredit(attribution: string | null | undefined): TPinakesCredit | null {
  if (!getAttributionParts(attribution).some((part) => MAP_DATA_ATTRIBUTION.test(part))) return null;
  return { field: MAP_DATA_FIELD, provider: MAP_DATA_PROVIDER, source_url: MAP_DATA_URL };
}

/** Whether a credit is one its licence asks for: every licence but CC0 (a Wikidata text). */
export function isCreditRequired(credit: Pick<TPinakesCredit, 'license'>): boolean {
  return !CC0_LICENSE.test(credit.license?.trim() ?? '');
}

/** A provider by its name; an unknown one by its source's host, else its id as given. */
export function getCreditProviderName(credit: Pick<TPinakesCredit, 'provider' | 'source_url'>): string {
  return PROVIDER_NAMES[credit.provider] ?? getLinkHost(credit.source_url) ?? credit.provider;
}

/**
 * A license id in words: `CC-BY-SA-4.0` → `CC BY-SA 4.0`, `CC0-1.0` → `CC0 1.0`, `public-domain`
 * → `Public domain`; any other id as given. `null` without one.
 */
export function getLicenseLabel(license: string | null | undefined): string | null {
  const id = license?.trim();
  if (!id) return null;
  if (id.toLowerCase() === PUBLIC_DOMAIN) return 'Public domain';
  const creativeCommons = CREATIVE_COMMONS_LICENSE.exec(id);
  if (creativeCommons) return `CC ${creativeCommons[1].toUpperCase()} ${creativeCommons[2]}`;
  const cc0 = CC0_LICENSE.exec(id);
  if (cc0) return `CC0 ${cc0[1]}`;
  return id;
}

/**
 * What a credit's `subject` (the entity its content is about, when another one) is called:
 * `its MusicBrainz work` for `https://musicbrainz.org/work/<id>`, `a related page on <host>` for
 * another web link. `null` when the subject is not `http(s)`.
 */
export function getCreditSubjectLabel(subject: string | null | undefined): string | null {
  const url = getHttpUrl(subject);
  if (!url) return null;
  const { hostname, pathname } = new URL(url);
  const host = hostname.replace(/^www\./i, '');
  const entity = pathname.split('/')[1];
  if (host === 'musicbrainz.org' && entity) return `its MusicBrainz ${entity.replaceAll('-', ' ')}`;
  return `a related page on ${host}`;
}
