import { getResourceRoute } from '@/app/routes';
import type { TPinakesRelated, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getNearestTypes } from './ResourceCard.utils';
import { formatCount, formatFactDate, formatSats, getFact, humanizeValue } from './ResourceFacts.utils';

/**
 * What a Bitcoin or Lightning card shows in its body instead of the summary line: lines that link
 * the blocks, transactions, addresses and nodes it names to their own pages (`/resource?uri=<root>`,
 * read on demand there when Pinakes does not know them yet), the lists of what it points at with a
 * bar for each amount, and how full a block is. Built from the card's `facts` and, where Pinakes
 * sends it, its `related` list.
 */

/** The chain card types, by schema.org type. */
export enum ChainKind {
  TX = 'tx',
  BLOCK = 'block',
  ADDRESS = 'address',
  NODE = 'node',
  CHANNEL = 'channel',
}

const KIND_BY_TYPE: Readonly<Record<string, ChainKind>> = {
  BitcoinTransaction: ChainKind.TX,
  BitcoinBlock: ChainKind.BLOCK,
  BitcoinAddress: ChainKind.ADDRESS,
  LightningNode: ChainKind.NODE,
  LightningChannel: ChainKind.CHANNEL,
};

/** A block's weight limit (BIP 141). */
export const BLOCK_WEIGHT_LIMIT = 4_000_000;
/** Rows a list shows before "+N more". */
export const CHAIN_LIST_MAX = 10;
/** A hash or key shortened in the middle keeps this many characters (`3d365b…e46fd5`). */
const SHORT_ID_LENGTH = 12;
/** A name this long or longer is an identifier, shortened in the title. */
const LONG_ID_LENGTH = 43;
/** A card root: `btc:tx/…`, `btc-testnet4:block/…`, `ln:node/…`, `ln-testnet:channel/…`. */
const ROOT = /^(btc|ln)(-[a-z0-9]+)?:(tx|block|address|node|channel)\/([^/?#\s]+)$/i;
const HEX_64 = /\b[0-9a-f]{64}\b/gi;

/** A card root split up: `btc` / `ln`, the network suffix (`''` on mainnet, `-testnet4`), kind, ID. */
export interface TChainRoot {
  chain: 'btc' | 'ln';
  network: string;
  kind: ChainKind;
  id: string;
}

export function parseChainRoot(uri: string | null | undefined): TChainRoot | null {
  const match = uri ? ROOT.exec(uri.trim()) : null;
  if (!match) return null;
  return {
    chain: match[1].toLowerCase() as 'btc' | 'ln',
    network: (match[2] ?? '').toLowerCase(),
    kind: match[3].toLowerCase() as ChainKind,
    id: match[4],
  };
}

/** The root of another object on the same network: a Lightning card's funding tx is `btc` there. */
export function getChainRoot(from: TChainRoot, kind: ChainKind, id: string): string {
  const chain = kind === ChainKind.NODE || kind === ChainKind.CHANNEL ? 'ln' : 'btc';
  return `${chain}${from.network}:${kind}/${id}`;
}

/** A hash, key or long address shortened in the middle: `3d365b…e46fd5`. */
export function shortenChainId(id: string): string {
  const half = SHORT_ID_LENGTH / 2;
  return id.length > SHORT_ID_LENGTH + 1 ? `${id.slice(0, half)}…${id.slice(-half)}` : id;
}

/** A link in a chain card's body: to the object's page in the app. */
export interface TChainLink {
  label: string;
  href: string;
  /** The object's full ID or name, for a shortened label (`title` and the accessible name). */
  full?: string;
  /** An ID shown in monospace. */
  mono?: boolean;
}

/** Text and links read as one part (`In` + `block 975,251`), joined with spaces. */
export type TChainGroup = Array<string | TChainLink>;

/** One line of the body: its parts joined with ` · `. */
export type TChainLine = Array<string | TChainLink | TChainGroup>;

export interface TChainRow {
  key: string;
  /** The object it opens, or `null` for one with no page (an `OP_RETURN` output). */
  link: TChainLink | null;
  /** What shows when there is no link. */
  text: string;
  /** Before the link: a transaction's date in an address's history. */
  lead?: string | null;
  amount: string | null;
  /** `in` (+, the app's green) or `out` (−, muted) for a signed amount. */
  sign?: 'in' | 'out' | null;
  /** The amount's share of the list's largest, 0-100, for its bar; `null` for none. */
  share: number | null;
}

export interface TChainList {
  key: string;
  title: string;
  rows: TChainRow[];
  /** How many more the object has than `rows` shows ("+390 more"). */
  more: number;
}

export interface TChainView {
  kind: ChainKind;
  /** The title with its identifier shortened, or `null` to keep the card's. */
  title: string | null;
  /** What the copy button next to the title copies, with its accessible name. */
  copy: { label: string; value: string } | null;
  /** A big figure under the title (an address's balance). */
  figure: string | null;
  /** The large card's lines under the title. */
  lines: TChainLine[];
  /** A feed card's one line, where other cards have their summary. */
  compact: TChainLine;
  /** How full a block is. */
  fill: { value: number; text: string; label: string } | null;
  lists: TChainList[];
  /** Facts the body shows, left out of the page's Details. */
  shownFacts: string[];
}

type TChainCard = Pick<TPinakesResourceDetail, 'uri' | 'type' | 'type_path' | 'name'> &
  Partial<Pick<TPinakesResourceDetail, 'facts' | 'start' | 'related' | 'related_total'>>;

/** The chain kind of a card by its type, or `null` for any other card. */
export function getChainKind(card: Pick<TPinakesResourceDetail, 'type' | 'type_path'>): ChainKind | null {
  return (
    getNearestTypes(card)
      .map((type) => KIND_BY_TYPE[type])
      .find(Boolean) ?? null
  );
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function plural(count: number, one: string, many = `${one}s`, locale?: string): string {
  return `${new Intl.NumberFormat(locale).format(count)} ${count === 1 ? one : many}`;
}

function relatedOf(card: TChainCard, rel: string): TPinakesRelated[] {
  return (card.related ?? []).filter((item) => item?.rel === rel);
}

/** The root of the first related object of `rel`, when it is a chain root. */
function relatedRoot(card: TChainCard, rel: string): string | null {
  const uri = relatedOf(card, rel)[0]?.uri?.trim();
  return uri && parseChainRoot(uri) ? uri : null;
}

function link(root: string, label: string, full?: string, mono = false): TChainLink {
  return { label, href: getResourceRoute(root), ...(full ? { full } : {}), ...(mono ? { mono } : {}) };
}

/** The page link of a related object, when its root is a chain root (anything else has no page here). */
function relatedLink(item: TPinakesRelated): TChainLink | null {
  const root = parseChainRoot(item.uri);
  if (!root || !item.uri) return null;
  const name = item.name?.trim();
  if (name && name !== root.id) return link(item.uri, name, root.id);
  return link(item.uri, shortenChainId(root.id), root.id, true);
}

/** A list of related objects of one `rel`, largest amount first as Pinakes sends them. */
function relatedList(
  card: TChainCard,
  rel: string,
  title: string,
  options: { total?: number | null; signed?: boolean; dated?: boolean; largest?: number; locale?: string } = {},
): TChainList | null {
  const items = relatedOf(card, rel);
  if (items.length === 0) return null;
  const shown = items.slice(0, CHAIN_LIST_MAX);
  const amounts = shown.map((item) => toNumber(item.amount_sat));
  const largest = options.largest ?? largestAmount(shown);
  // Pinakes' own count of what it cut (an address's counts its unconfirmed ones too), else the fact's.
  const total = toNumber(card.related_total?.[rel]) ?? options.total ?? items.length;
  const rows = shown.map((item, index): TChainRow => {
    const amount = amounts[index];
    const sign = options.signed && amount ? (amount > 0 ? 'in' : 'out') : null;
    const formatted = amount === null ? null : formatSats(String(Math.abs(amount)), options.locale);
    return {
      key: `${rel}-${index}`,
      link: relatedLink(item),
      text: item.name?.trim() || 'Unknown',
      // A transaction still in the mempool has no time yet (Pinakes lists those first).
      lead: options.dated ? (formatFactDate(item.at, options.locale) ?? 'Unconfirmed') : null,
      amount: formatted && sign ? `${sign === 'in' ? '+' : '−'}${formatted}` : formatted,
      sign,
      share: amount !== null && largest > 0 ? (Math.abs(amount) / largest) * 100 : null,
    };
  });
  return { key: rel, title, rows, more: Math.max(0, total - rows.length) };
}

/** The largest amount among the first `CHAIN_LIST_MAX` items, what a list's bars are measured against. */
function largestAmount(items: TPinakesRelated[]): number {
  return Math.max(0, ...items.slice(0, CHAIN_LIST_MAX).map((item) => Math.abs(toNumber(item.amount_sat) ?? 0)));
}

/** `2.01 sat/vB` from a fee in sats and a size in vB. */
export function formatFeeRate(fee: string | null, vsize: string | null, locale?: string): string | null {
  const sats = toNumber(fee);
  const size = toNumber(vsize);
  if (sats === null || size === null || size <= 0) return null;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(sats / size)} sat/vB`;
}

function txView(card: TChainCard, root: TChainRoot, locale?: string): TChainView {
  const fact = (key: string) => getFact(card, key);
  const shown = ['block_hash', 'block_height', 'confirmed', 'coinbase', 'fee', 'inputs', 'outputs', 'output_value'];
  const blockHash = fact('block_hash');
  const height = formatCount(fact('block_height'), locale);
  const blockRoot = relatedRoot(card, 'block') ?? (blockHash ? getChainRoot(root, ChainKind.BLOCK, blockHash) : null);
  const date = formatFactDate(card.start, locale);
  const placed: TChainLine = [];
  if (fact('coinbase') === 'true') placed.push('Coinbase');
  if (blockRoot) {
    // Its height from the fact, else the name Pinakes gives the related block ("Block 975,251").
    const named = relatedOf(card, 'block')[0]?.name?.trim();
    const label = height ? `block ${height}` : named ? named.charAt(0).toLowerCase() + named.slice(1) : 'its block';
    placed.push(['In', link(blockRoot, label, parseChainRoot(blockRoot)?.id)]);
    if (date) placed.push(date);
  } else if (fact('confirmed') === 'false') {
    placed.push('Unconfirmed');
  }
  // A coinbase transaction pays no fee.
  const isCoinbase = fact('coinbase') === 'true';
  const fee = isCoinbase ? null : formatSats(fact('fee'), locale);
  const rate = isCoinbase ? null : formatFeeRate(fact('fee'), fact('vsize'), locale);
  const inputs = toNumber(fact('inputs'));
  const outputs = toNumber(fact('outputs'));
  const flow =
    inputs !== null && outputs !== null
      ? `${plural(inputs, 'input', undefined, locale)} → ${plural(outputs, 'output', undefined, locale)}`
      : null;
  const value = formatSats(fact('output_value'), locale);
  const lines: TChainLine[] = [
    [...placed, ...(flow ? [flow] : [])],
    [...(fee ? [`Fee ${fee}`] : []), ...(rate ? [rate] : []), ...(value ? [`${value} out`] : [])],
  ];
  // Inputs and outputs are measured on one scale: many small inputs into one output read as such.
  const largest = Math.max(largestAmount(relatedOf(card, 'input')), largestAmount(relatedOf(card, 'output')));
  const lists = [
    relatedList(card, 'input', 'Inputs', { total: inputs, largest, locale }),
    relatedList(card, 'output', 'Outputs', { total: outputs, largest, locale }),
  ].filter((list): list is TChainList => list !== null);
  return {
    kind: ChainKind.TX,
    title: shortenTitle(card.name),
    copy: { label: 'Copy transaction ID', value: root.id },
    figure: null,
    lines: lines.filter((line) => line.length > 0),
    compact: lines[0],
    fill: null,
    lists,
    shownFacts: [...shown, 'start'],
  };
}

function blockView(card: TChainCard, root: TChainRoot, locale?: string): TChainView {
  const fact = (key: string) => getFact(card, key);
  const height = toNumber(fact('height'));
  const previousHash = fact('previous_block');
  const previous =
    relatedRoot(card, 'previous') ?? (previousHash ? getChainRoot(root, ChainKind.BLOCK, previousHash) : null);
  const next = relatedRoot(card, 'next');
  const heightLabel = (value: number) => `Block ${new Intl.NumberFormat(locale).format(value)}`;
  const steps: TChainLine = [];
  if (previous) {
    const label = height !== null && height > 0 ? heightLabel(height - 1) : 'Previous block';
    steps.push(link(previous, `← ${label}`, parseChainRoot(previous)?.id));
  }
  if (next) {
    const label = height !== null ? heightLabel(height + 1) : 'Next block';
    steps.push(link(next, `${label} →`, parseChainRoot(next)?.id));
  }
  const txCount = toNumber(fact('tx_count'));
  const about: TChainLine = [
    ...(formatFactDate(card.start, locale) ? [formatFactDate(card.start, locale)!] : []),
    ...(txCount !== null ? [plural(txCount, 'transaction', undefined, locale)] : []),
    ...(fact('pool') ? [fact('pool')!] : []),
  ];
  const coinbase = relatedRoot(card, 'coinbase');
  const coinbaseId = parseChainRoot(coinbase)?.id;
  const coinbaseLine: TChainLine =
    coinbase && coinbaseId ? [['Coinbase', link(coinbase, shortenChainId(coinbaseId), coinbaseId, true)]] : [];
  const weight = toNumber(fact('weight'));
  const size = formatCount(fact('size'), locale);
  const fill =
    weight !== null && weight > 0
      ? {
          value: Math.min(100, (weight / BLOCK_WEIGHT_LIMIT) * 100),
          text: [
            `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(weight / 1_000_000)} of 4 MWU`,
            ...(size ? [`${size} bytes`] : []),
          ].join(' · '),
          label: `Block weight: ${Math.round((weight / BLOCK_WEIGHT_LIMIT) * 100)}% of the ${new Intl.NumberFormat(locale).format(BLOCK_WEIGHT_LIMIT)} WU limit`,
        }
      : null;
  return {
    kind: ChainKind.BLOCK,
    title: null,
    // The hash stays in Details, copied in full from here.
    copy: { label: 'Copy block hash', value: fact('hash') ?? root.id },
    figure: null,
    lines: [about, steps, coinbaseLine].filter((line) => line.length > 0),
    compact: about,
    fill,
    lists: [],
    shownFacts: ['height', 'previous_block', 'tx_count', 'pool', 'weight', 'size', 'start'],
  };
}

function addressView(card: TChainCard, root: TChainRoot, locale?: string): TChainView {
  const fact = (key: string) => getFact(card, key);
  const balance = toNumber(fact('balance'));
  const received = toNumber(fact('received'));
  const sent = balance !== null && received !== null && received >= balance ? received - balance : null;
  const txCount = toNumber(fact('tx_count'));
  const line: TChainLine = [
    ...(received !== null ? [`Received ${formatSats(String(received), locale)}`] : []),
    ...(sent !== null ? [`Sent ${formatSats(String(sent), locale)}`] : []),
    ...(txCount !== null ? [plural(txCount, 'transaction', undefined, locale)] : []),
  ];
  const latest = relatedList(card, 'tx', 'Latest transactions', {
    total: txCount,
    signed: true,
    dated: true,
    locale,
  });
  return {
    kind: ChainKind.ADDRESS,
    title: shortenTitle(card.name),
    copy: { label: 'Copy address', value: root.id },
    figure: balance !== null ? formatSats(String(balance), locale) : null,
    lines: line.length > 0 ? [line] : [],
    compact: [
      ...(balance !== null ? [formatSats(String(balance), locale)!] : []),
      ...(txCount !== null ? [plural(txCount, 'transaction', undefined, locale)] : []),
    ],
    fill: null,
    lists: latest ? [latest] : [],
    shownFacts: ['balance', 'received', 'tx_count'],
  };
}

function nodeView(card: TChainCard, root: TChainRoot, locale?: string): TChainView {
  const fact = (key: string) => getFact(card, key);
  const channels = toNumber(fact('channels'));
  const capacity = formatSats(fact('capacity'), locale);
  const line: TChainLine = [
    ...(channels !== null ? [plural(channels, 'channel', undefined, locale)] : []),
    ...(capacity ? [`${capacity} capacity`] : []),
  ];
  // Each channel opens the node at its other end (Pinakes names a channel after that peer; its
  // `peer` entries are those nodes, each once); one with no known peer opens the channel.
  const peers = relatedOf(card, 'peer');
  const biggest = relatedList(card, 'channel', 'Biggest channels', { total: channels, locale });
  biggest?.rows.forEach((row, index) => {
    const name = relatedOf(card, 'channel')[index]?.name?.trim();
    const peer = name ? peers.find((item) => item.name?.trim() === name) : undefined;
    if (peer) row.link = relatedLink(peer) ?? row.link;
  });
  return {
    kind: ChainKind.NODE,
    title: shortenTitle(card.name),
    copy: { label: 'Copy node public key', value: fact('public_key') ?? root.id },
    figure: null,
    lines: line.length > 0 ? [line] : [],
    compact: line,
    fill: null,
    lists: biggest ? [biggest] : [],
    shownFacts: ['alias', 'channels', 'capacity', 'public_key'],
  };
}

function channelView(card: TChainCard, root: TChainRoot, locale?: string): TChainView {
  const fact = (key: string) => getFact(card, key);
  const node = (n: 1 | 2): string | TChainLink | null => {
    const key = fact(`node${n}`);
    const alias = fact(`node${n}_alias`);
    if (!key) return alias;
    return link(getChainRoot(root, ChainKind.NODE, key), alias ?? shortenChainId(key), key, !alias);
  };
  const one = node(1);
  const two = node(2);
  const txOf = (rel: string) => {
    const hash = fact(rel);
    return relatedRoot(card, rel) ?? (hash ? getChainRoot(root, ChainKind.TX, hash) : null);
  };
  const txLink = (tx: string) => {
    const id = parseChainRoot(tx)?.id ?? tx;
    return link(tx, shortenChainId(id), id, true);
  };
  const funding = txOf('funding_tx');
  const closing = txOf('closing_tx');
  const capacity = formatSats(fact('capacity'), locale);
  const status = fact('status');
  const ends: TChainLine = one && two ? [[one, '↔', two]] : [];
  const about: TChainLine = [
    ...(capacity ? [capacity] : []),
    ...(status ? [humanizeValue(status)] : []),
    ...(funding ? [['Funding', txLink(funding)]] : []),
    ...(closing ? [['Closed by', txLink(closing)]] : []),
  ];
  return {
    kind: ChainKind.CHANNEL,
    title: null,
    copy: null,
    figure: null,
    lines: [ends, about].filter((line) => line.length > 0),
    compact: [...ends, ...(capacity ? [capacity] : [])],
    fill: null,
    lists: [],
    shownFacts: ['node1', 'node1_alias', 'node2', 'node2_alias', 'capacity', 'status', 'funding_tx', 'closing_tx'],
  };
}

/** The title with a 64-hex ID, or a name that is one long ID, shortened in the middle. */
function shortenTitle(name: string | null | undefined): string | null {
  const title = name?.trim();
  if (!title) return null;
  const shortened = title.replace(HEX_64, (hex) => shortenChainId(hex));
  if (shortened !== title) return shortened;
  return !/\s/.test(title) && title.length >= LONG_ID_LENGTH ? shortenChainId(title) : null;
}

/**
 * A chain card's body (`TChainView`), or `null` for a card that is not a block, transaction,
 * address, Lightning node or channel, or whose `uri` is not a chain root.
 *
 * @param locale - For tests; the viewer's locale when omitted
 */
export function getChainView(card: TChainCard, locale?: string): TChainView | null {
  const kind = getChainKind(card);
  const root = parseChainRoot(card.uri);
  if (!kind || !root || root.kind !== kind) return null;
  switch (kind) {
    case ChainKind.TX:
      return txView(card, root, locale);
    case ChainKind.BLOCK:
      return blockView(card, root, locale);
    case ChainKind.ADDRESS:
      return addressView(card, root, locale);
    case ChainKind.NODE:
      return nodeView(card, root, locale);
    case ChainKind.CHANNEL:
      return channelView(card, root, locale);
  }
}
