import rules from '@/libs/post/linkRules.data.json';
import { getLinkRanges } from '@/libs/post/postLinkUrl';

/*
 * Pinakes' published link rules, built into the app so a write never waits on a Pinakes: the query
 * parameters Pinakes drops as tracking (`tracking`) and the web page of an identifier (`pages`),
 * from Pinakes' `data/spellings.json` at the version in `linkRules.data.json`'s `spelling_rules`
 * (Pinakes' `/v1/info` `spelling_rules`). `linkRules.data.json` is generated: regenerate it with
 * `node scripts/pinakes-link-rules.mjs` when Pinakes publishes a new version.
 */

type TrackingParam = { param: string; match: string; hosts: string[] };

const TRACKING: readonly TrackingParam[] = rules.tracking;

/** Whether a parameter named `name` on `host` is one Pinakes drops as tracking. */
function isTracking(host: string, name: string): boolean {
  return TRACKING.some(
    (t) =>
      (t.match === 'prefix' ? name.startsWith(t.param) : name === t.param) &&
      (t.hosts.length === 0 || t.hosts.some((h) => host === h || host.endsWith(`.${h}`))),
  );
}

function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    // A malformed escape is no listed name.
    return name;
  }
}

/** The lower-case host of a web link (`http:`/`https:`, punycode for a non-ASCII name), or `null`. */
function webHost(link: string): string | null {
  try {
    const url = new URL(link);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname : null;
  } catch {
    return null;
  }
}

/** `link` with the listed parameters dropped from its raw query, `host` being its host. */
function withoutTracking(link: string, host: string): string {
  const hash = link.indexOf('#');
  const end = hash < 0 ? link.length : hash;
  // A `?` in the fragment is no query (hash routes: `/#/page?…`).
  const start = link.slice(0, end).indexOf('?');
  if (start < 0) return link;
  const pieces = link.slice(start + 1, end).split('&');
  const kept = pieces.filter((piece) => !isTracking(host, decodeName(piece.split('=')[0])));
  if (kept.length === pieces.length) return link;
  return `${link.slice(0, start)}${kept.length > 0 ? `?${kept.join('&')}` : ''}${link.slice(end)}`;
}

/**
 * A web link without the query parameters Pinakes drops as tracking (`utm_*`, `fbclid`, a share
 * link's `si`, …, the vendored `tracking` list): split at `&`, each parameter by its
 * percent-decoded name, on the hosts it tracks on; every other parameter keeps its place and
 * encoding, and an empty query goes with its `?`. Anything that is no `http:`/`https:` link, and
 * a link without them, comes back as it is.
 */
export function removeTracking(link: string): string {
  const host = webHost(link);
  return host ? withoutTracking(link, host) : link;
}

/**
 * A link as written in text without its tracking parameters, keeping a run of closing punctuation
 * at its end (`.`, `)`, …) where it was: linkify may count it in the link, but it is the text's.
 */
function withoutTrackingInText(raw: string, host: string): string {
  const tail = /[.,;:!?)\]'"]*$/.exec(raw)?.[0] ?? '';
  const clean = withoutTracking(raw.slice(0, raw.length - tail.length), host) + tail;
  return clean.length < raw.length ? clean : raw;
}

/**
 * The text with every link in it (bare links and Markdown link targets, as `getLinkRanges` finds
 * them) without its tracking parameters (`removeTracking`). Nothing else in the text changes.
 */
export function removeTrackingInText(text: string): string {
  let out = '';
  let at = 0;
  for (const { index, lastIndex, url } of getLinkRanges(text)) {
    const host = webHost(url);
    if (!host) continue;
    const raw = text.slice(index, lastIndex);
    const clean = withoutTrackingInText(raw, host);
    if (clean === raw) continue;
    out += text.slice(at, index) + clean;
    at = lastIndex;
  }
  return at === 0 ? text : out + text.slice(at);
}

/** A link in a text field's value, from `index` up to `lastIndex`, and its text without tracking parameters. */
export type TrackedLink = { index: number; lastIndex: number; clean: string };

/**
 * The links a change to a text field has just completed that carry tracking parameters, last first:
 * the links the change put in when it put in more than one character (a paste, a drop, a keyboard's
 * clipboard or suggestion) unless it runs on into text after the caret (a link pasted right in front
 * of a word: the space the user then types ends it), and the link a space or line break just typed
 * ends, past any closing punctuation (`.`, `)`, …).
 * A link being typed, and every link the change did not touch, stays as it is.
 */
export function getTrackedLinksAsTyped(previous: string, value: string, caret: number): TrackedLink[] {
  if (value === previous) return [];
  let from = 0;
  while (from < caret && value[from] === previous[from]) from += 1;
  const pasted = caret - from > 1;
  const ended = value.length > previous.length && /\s/.test(value.charAt(caret - 1));
  const links: TrackedLink[] = [];
  for (const { index, lastIndex, url } of getLinkRanges(value)) {
    const host = webHost(url);
    const touched = pasted
      ? index < caret && lastIndex >= from && /^[.,;:!?)\]'"]*$/.test(value.slice(caret, lastIndex))
      : ended && lastIndex < caret && /^[.,;:!?)\]'"]*\s$/.test(value.slice(lastIndex, caret));
    if (!host || !touched) continue;
    const raw = value.slice(index, lastIndex);
    const clean = withoutTrackingInText(raw, host);
    if (clean !== raw) links.unshift({ index, lastIndex, clean });
  }
  return links;
}

/** The ISBN-13 of an ISBN-10 or ISBN-13 (hyphens and spaces ignored), or `null` when invalid. */
function isbn13(value: string): string | null {
  const s = value.replace(/[- ]/g, '').toUpperCase();
  if (/^[0-9]{9}[0-9X]$/.test(s)) {
    const sum = [...s].reduce((acc, c, i) => acc + (10 - i) * (c === 'X' ? 10 : Number(c)), 0);
    if (sum % 11 !== 0) return null;
    const body = `978${s.slice(0, 9)}`;
    const check = [...body].reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
    return `${body}${(10 - (check % 10)) % 10}`;
  }
  if (!/^[0-9]{13}$/.test(s)) return null;
  const check = [...s].reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
  return check % 10 === 0 ? s : null;
}

/** A DOI's page on the DOI proxy, in lower case, with `%`, `?` and `#` percent-encoded. */
function doiPage(value: string): string | null {
  const doi = value.toLowerCase();
  const slash = doi.indexOf('/');
  const prefix = slash < 0 ? '' : doi.slice(0, slash);
  if (!/^10\.[0-9]{4,9}$/.test(prefix) || slash === doi.length - 1 || doi.length > 512) return null;
  if (/[\s\p{Cc}]/u.test(doi)) return null;
  return `https://doi.org/${doi.replace(/%/g, '%25').replace(/\?/g, '%3F').replace(/#/g, '%23')}`;
}

const MEMPOOL = 'https://mempool.space';
const BITCOIN_NETWORKS: Record<string, string> = {
  btc: '',
  'btc-testnet': '/testnet',
  'btc-testnet4': '/testnet4',
  'btc-signet': '/signet',
};
const LIGHTNING_NETWORKS: Record<string, string> = {
  ln: '',
  'ln-testnet': '/testnet',
  'ln-testnet4': '/testnet4',
  'ln-signet': '/signet',
};

/** One identifier scheme's page: the value after `{scheme}:` → its page, or `null` when it names none. */
type PageRule = (value: string) => string | null;

const match =
  (pattern: RegExp, page: (m: RegExpExecArray) => string): PageRule =>
  (value) => {
    const m = pattern.exec(value);
    return m ? page(m) : null;
  };

/**
 * `value` with every character `keep` refuses percent-encoded as UTF-8, upper-case hex, as Rust's
 * `utf8_percent_encode` writes it (non-ASCII always).
 */
function percentEncode(value: string, keep: (c: string) => boolean): string {
  let out = '';
  for (const c of value) {
    if (c.charCodeAt(0) < 0x80 && keep(c)) out += c;
    else for (const b of new TextEncoder().encode(c)) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** `value` with its `%XX` escapes decoded as UTF-8 and a lone `%` kept, or `null` for invalid UTF-8. */
function percentDecode(value: string): string | null {
  try {
    return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapes) => decodeURIComponent(escapes));
  } catch {
    return null;
  }
}

const isControl = (c: string) => /\p{Cc}/u.test(c);

/** A Commons file name in MediaWiki's normal form (`_` for spaces, first letter upper case), or `null`. */
function commonsFileName(raw: string): string | null {
  const name = raw.replace(/_/g, ' ').split(' ').filter(Boolean).join('_');
  const bad = [...name].some((c) => isControl(c) || '#<>[]|{}/'.includes(c));
  if (!name || new TextEncoder().encode(name).length > 240 || bad || /%[0-9A-Fa-f]{2}/.test(name)) return null;
  const [first] = name;
  if (/[\u10D0-\u10FA\u10FD-\u10FF]/.test(first)) return name;
  const upper = first.toUpperCase();
  return [...upper].length === 1 ? upper + name.slice(first.length) : name;
}

/**
 * A Commons file's page: only for a root in the form Pinakes writes it (`commons:File:` + the name in
 * normal form, non-ASCII and controls percent-encoded, and `"` after its first `?`), written the way
 * MediaWiki writes the page's URL (`wfUrlencode`).
 */
function commonsPage(value: string): string | null {
  if (!value.startsWith('File:')) return null;
  const name = percentDecode(value.slice('File:'.length));
  if (name === null || commonsFileName(name) !== name) return null;
  const query = name.indexOf('?');
  const [path, rest] = query < 0 ? [name, ''] : [name.slice(0, query), name.slice(query)];
  const plain = (c: string) => !isControl(c);
  if (`${percentEncode(path, plain)}${percentEncode(rest, (c) => plain(c) && c !== '"')}` !== value.slice(5))
    return null;
  const title = percentEncode(`File:${name}`, (c) => /[A-Za-z0-9\-._~;@$!*(),/:]/.test(c));
  return `https://commons.wikimedia.org/wiki/${title}`;
}

const DOCKER_PART = '[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?';
const MB_KINDS = new Set(['recording', 'release', 'release-group', 'artist']);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const HF_PART = '[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?';

/** Every scheme that has a page, as Pinakes builds it (`alias::web_page`, each source's `root_page`). */
const PAGE_RULES: Record<string, PageRule> = {
  wikidata: match(/^[Qq]([1-9][0-9]*)$/, (m) => `https://www.wikidata.org/wiki/Q${m[1]}`),
  mb: (value) => {
    const m = new RegExp(`^([a-z-]+):(${UUID})$`, 'i').exec(value);
    return m && MB_KINDS.has(m[1]) ? `https://musicbrainz.org/${m[1]}/${m[2].toLowerCase()}` : null;
  },
  isrc: match(/^([A-Za-z]{2}[A-Za-z0-9]{3}[0-9]{7})$/, (m) => `https://musicbrainz.org/isrc/${m[1].toUpperCase()}`),
  osm: match(/^(node|way|relation)\/([1-9][0-9]*)$/, (m) => `https://www.openstreetmap.org/${m[1]}/${m[2]}`),
  doi: doiPage,
  isbn: (value) => {
    const isbn = isbn13(value);
    return isbn ? `https://openlibrary.org/isbn/${isbn}` : null;
  },
  artic: match(/^([1-9][0-9]{0,9})$/, (m) => `https://www.artic.edu/artworks/${m[1]}`),
  cleveland: match(
    /^(?=.{1,32}$)([0-9]{1,12}(?:\.[0-9a-z]{1,12})+)$/,
    (m) => `https://www.clevelandart.org/art/${m[1]}`,
  ),
  nct: match(/^(NCT[0-9]{8})$/i, (m) => `https://clinicaltrials.gov/study/${m[1].toUpperCase()}`),
  commons: commonsPage,
  docker: match(new RegExp(`^(${DOCKER_PART})/(${DOCKER_PART})$`), (m) =>
    m[1] === 'library' ? `https://hub.docker.com/_/${m[2]}` : `https://hub.docker.com/r/${m[1]}/${m[2]}`,
  ),
  fr: match(/^([A-Z0-9]{1,4}(?:-[0-9]{1,6}){1,2})$/, (m) => `https://www.federalregister.gov/d/${m[1]}`),
  figshare: match(/^([1-9][0-9]*)$/, (m) => `https://figshare.com/articles/_/${m[1]}`),
  gbif: match(/^(species|occurrence)\/([1-9][0-9]*)$/, (m) => `https://www.gbif.org/${m[1]}/${m[2]}`),
  lei: match(/^([A-Z0-9]{18}[0-9]{2})$/, (m) => `https://www.gleif.org/lei/${m[1]}`),
  hf: match(new RegExp(`^(model|dataset|space)/(${HF_PART}/${HF_PART})$`), (m) => {
    const prefix = m[1] === 'dataset' ? 'datasets/' : m[1] === 'space' ? 'spaces/' : '';
    return `https://huggingface.co/${prefix}${m[2]}`;
  }),
  inat: match(
    /^(observation|taxon)\/([1-9][0-9]*)$/,
    (m) => `https://www.inaturalist.org/${m[1] === 'taxon' ? 'taxa' : 'observations'}/${m[2]}`,
  ),
  ia: match(/^([A-Za-z0-9_-][A-Za-z0-9._-]{0,99})$/, (m) => `https://archive.org/details/${m[1]}`),
  met: match(/^([1-9][0-9]{0,9})$/, (m) => `https://www.metmuseum.org/art/collection/search/${m[1]}`),
  pdb: match(/^([1-9][A-Za-z0-9]{3})$/, (m) => `https://www.rcsb.org/structure/${m[1].toUpperCase()}`),
  pubchem: match(/^cid\/([1-9][0-9]*)$/, (m) => `https://pubchem.ncbi.nlm.nih.gov/compound/${m[1]}`),
  ror: match(/^(0[0-9a-z]{8})$/, (m) => `https://ror.org/${m[1]}`),
  uniprot: match(/^([A-Z0-9]{6}(?:[A-Z0-9]{4})?)$/, (m) => `https://www.uniprot.org/uniprotkb/${m[1]}/entry`),
  usgs: match(/^([a-z0-9_-]{1,64})$/, (m) => `https://earthquake.usgs.gov/earthquakes/eventpage/${m[1]}`),
  zenodo: match(/^([1-9][0-9]*)$/, (m) => `https://zenodo.org/records/${m[1]}`),
  ...Object.fromEntries(
    Object.entries(BITCOIN_NETWORKS).map(([scheme, net]) => [
      scheme,
      match(/^(block\/[0-9a-f]{64}|tx\/[0-9a-f]{64}|address\/[A-Za-z0-9]{14,90})$/, (m) => `${MEMPOOL}${net}/${m[1]}`),
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(LIGHTNING_NETWORKS).map(([scheme, net]) => [
      scheme,
      match(/^(node\/[0-9a-f]{66}|channel\/[1-9][0-9]*)$/, (m) => `${MEMPOOL}${net}/lightning/${m[1]}`),
    ]),
  ),
};

/**
 * The web page of an identifier (`wikidata:Q42`, `isbn:…`, `doi:…`, `btc:tx/…`, …) as Pinakes
 * publishes it (`pages`, the vendored list): built from the identifier alone, so it is the same
 * whichever Pinakes a card came from, and it folds back to that identifier's card. `null` for a web
 * link and for an identifier with no single page (`mbid:`, `imdb:`, `upc:`, `gtin:`, `podcast:…`).
 */
export function getIdentifierPage(identifier: string): string | null {
  const colon = identifier.indexOf(':');
  if (colon <= 0) return null;
  const rule = PAGE_RULES[identifier.slice(0, colon).toLowerCase()];
  return rule ? rule(identifier.slice(colon + 1)) : null;
}
