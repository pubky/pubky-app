import { describe, expect, it } from 'vitest';
import type { TPinakesRelated } from '@/services/pinakes/pinakes.types';
import {
  ChainKind,
  formatFeeRate,
  getChainView,
  parseChainRoot,
  shortenChainId,
  type TChainLine,
  type TChainLink,
} from './ResourceChain.utils';

const LOCALE = 'en-US';
const TXID = '3d365ba65953e39c2ff64186022fe9ccf4ac0694888d9bf0c57a45de23e46fd5';
const BLOCK_HASH = '0000000000000000000008dfb288144ec4626cad43656ff2cdd8cb278886fe80';
const BLOCK = '0000000000000000001c8018d9cb3b742ef25114f27563e3fc4a1902167f9893';
const PREVIOUS = '000000000000000000cbeff0b533f8e1189cf09dfbebf57a8ebe349362811b80';
const ACINQ = '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f';
const BFX = '033d8656219478701227199cbd6f670335c8d408a92ae88b962c49d4dc0e83e025';
const FUNDING = 'a7f10c2595c8ea0cc85c3183709d10aada60c7b87fe0c405f3f5b8a44150d4f5';

type TCard = Parameters<typeof getChainView>[0];

function chainCard(type: string, uri: string, facts: Record<string, string>, rest: Partial<TCard> = {}): TCard {
  return { uri, type, type_path: ['Thing', type], name: null, facts, ...rest };
}

const route = (root: string) => `/resource?uri=${encodeURIComponent(root)}`;

/** Every link on a view's lines, flattened. */
function links(lines: TChainLine[]): TChainLink[] {
  return lines.flat(2).filter((part): part is TChainLink => typeof part === 'object' && part !== null);
}

/** A line as it reads. */
function text(line: TChainLine): string {
  const part = (item: TChainLine[number]): string =>
    typeof item === 'string' ? item : Array.isArray(item) ? item.map(part).join(' ') : item.label;
  return line.map(part).join(' · ');
}

const TX = chainCard(
  'BitcoinTransaction',
  `btc:tx/${TXID}`,
  {
    block_hash: BLOCK_HASH,
    block_height: '975251',
    coinbase: 'false',
    confirmed: 'true',
    fee: '118488',
    inputs: '400',
    output_value: '129015985',
    outputs: '1',
    size: '59057',
    vsize: '59057',
    weight: '236228',
  },
  { name: `Transaction ${TXID}`, start: '2026-11-10T03:32:51Z' },
);

describe('parseChainRoot', () => {
  it('splits a root into chain, network, kind and ID', () => {
    expect(parseChainRoot(`btc:tx/${TXID}`)).toEqual({ chain: 'btc', network: '', kind: ChainKind.TX, id: TXID });
    expect(parseChainRoot(`btc-testnet4:block/${BLOCK}`)).toMatchObject({ network: '-testnet4', kind: 'block' });
    expect(parseChainRoot(`ln-testnet:node/${ACINQ}`)).toMatchObject({ chain: 'ln', network: '-testnet' });
  });

  it('reads nothing else as a root', () => {
    expect(parseChainRoot(`https://mempool.space/tx/${TXID}`)).toBeNull();
    expect(parseChainRoot('btc:wallet/x')).toBeNull();
    expect(parseChainRoot(null)).toBeNull();
  });
});

describe('getChainView', () => {
  it('is null for any other card, and for a chain type whose uri is not its root', () => {
    expect(getChainView({ uri: 'https://example.com', type: 'Article', type_path: ['Thing', 'Article'] })).toBeNull();
    expect(getChainView({ ...TX, uri: `https://mempool.space/tx/${TXID}` })).toBeNull();
    expect(getChainView({ ...TX, uri: `btc:block/${BLOCK}` })).toBeNull();
  });

  it('a transaction: short ID in the title, its block linked, fee and rate once, Details left without them', () => {
    const view = getChainView(TX, LOCALE)!;
    expect(view.title).toBe('Transaction 3d365b…e46fd5');
    expect(view.copy).toEqual({ label: 'Copy transaction ID', value: TXID });
    expect(view.lines.map(text)).toEqual([
      'In block 975,251 · Nov 10, 2026 · 400 inputs → 1 output',
      'Fee 118,488 sats · 2.01 sat/vB · 1.29 BTC out',
    ]);
    expect(links(view.lines)).toEqual([
      { label: 'block 975,251', href: route(`btc:block/${BLOCK_HASH}`), full: BLOCK_HASH },
    ]);
    expect(view.compact).toEqual(view.lines[0]);
    expect(view.shownFacts).toEqual(expect.arrayContaining(['confirmed', 'block_hash', 'fee', 'start']));
    expect(view.shownFacts).not.toContain('size');
  });

  it('a coinbase and an unconfirmed transaction say so; a coinbase has no fee', () => {
    const coinbase = getChainView({ ...TX, facts: { ...TX.facts, coinbase: 'true', fee: '0' } }, LOCALE)!;
    expect(coinbase.lines.map(text)).toEqual([
      'Coinbase · In block 975,251 · Nov 10, 2026 · 400 inputs → 1 output',
      '1.29 BTC out',
    ]);
    const named = getChainView(
      {
        ...TX,
        facts: { fee: '0' },
        related: [{ rel: 'block', uri: `btc:block/${BLOCK_HASH}`, name: 'Block 975,251' }],
      },
      LOCALE,
    )!;
    expect(text(named.lines[0])).toBe('In block 975,251 · Nov 10, 2026');
    const unconfirmed = { confirmed: 'false', inputs: '1', outputs: '2' };
    expect(text(getChainView({ ...TX, start: null, facts: unconfirmed }, LOCALE)!.lines[0])).toBe(
      'Unconfirmed · 1 input → 2 outputs',
    );
  });

  it('lists inputs and outputs from `related`, cut with "+N more", bars on one scale', () => {
    const related: TPinakesRelated[] = [
      { rel: 'input', uri: 'btc:address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', amount_sat: 2_000_000 },
      { rel: 'input', uri: 'btc:address/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount_sat: 500_000 },
      { rel: 'output', uri: null, name: 'OP_RETURN', amount_sat: 0 },
      { rel: 'output', uri: 'btc:address/bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', amount_sat: 129_015_985 },
    ];
    const view = getChainView({ ...TX, related, related_total: { input: 400 } }, LOCALE)!;
    const [inputs, outputs] = view.lists;
    expect(inputs).toMatchObject({ key: 'input', title: 'Inputs', more: 398 });
    // One scale for inputs and outputs: the largest is the 1.29 BTC output.
    expect(inputs.rows.map((row) => [row.link?.label, row.amount, row.share?.toFixed(2)])).toEqual([
      ['1A1zP1…DivfNa', '0.02 BTC', '1.55'],
      ['bc1qar…wf5mdq', '500,000 sats', '0.39'],
    ]);
    expect(outputs.rows[1].share).toBe(100);
    expect(inputs.rows[0].link).toMatchObject({
      href: route('btc:address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
      full: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      mono: true,
    });
    // `outputs` is the fact (1), not the list's length; an output with no root is text.
    expect(outputs.more).toBe(0);
    expect(outputs.rows[0]).toMatchObject({ link: null, text: 'OP_RETURN', amount: '0 sats' });
  });

  it('a block: when, how many, previous and next linked, its fill of the weight limit, the hash in full', () => {
    const related: TPinakesRelated[] = [
      { rel: 'next', uri: `btc:block/${'0'.repeat(10)}${'a'.repeat(54)}` },
      { rel: 'coinbase', uri: `btc:tx/${FUNDING}` },
    ];
    const block = chainCard(
      'BitcoinBlock',
      `btc:block/${BLOCK}`,
      {
        hash: BLOCK,
        height: '481824',
        previous_block: PREVIOUS,
        size: '989323',
        tx_count: '1866',
        weight: '3954880',
      },
      { name: 'Block 481,824', start: '2017-08-24T01:57:37Z', related },
    );
    const view = getChainView(block, LOCALE)!;
    expect(view.title).toBeNull();
    expect(view.lines.map(text)).toEqual([
      'Aug 24, 2017 · 1,866 transactions',
      '← Block 481,823 · Block 481,825 →',
      'Coinbase a7f10c…50d4f5',
    ]);
    expect(links(view.lines).map((item) => item.href)).toEqual([
      route(`btc:block/${PREVIOUS}`),
      route(`btc:block/${'0'.repeat(10)}${'a'.repeat(54)}`),
      route(`btc:tx/${FUNDING}`),
    ]);
    expect(view.fill?.value).toBeCloseTo(98.87, 2);
    expect(view.fill?.text).toBe('3.95 of 4 MWU · 989,323 bytes');
    // The hash stays a Details row; the copy button copies it.
    expect(view.copy).toEqual({ label: 'Copy block hash', value: BLOCK });
    expect(view.shownFacts).not.toContain('hash');
    expect(view.compact).toEqual(view.lines[0]);
  });

  it('a block without `related` links only its previous block', () => {
    const view = getChainView(
      chainCard('BitcoinBlock', `btc:block/${BLOCK}`, { height: '481824', previous_block: PREVIOUS }),
      LOCALE,
    )!;
    expect(view.lines.map(text)).toEqual(['← Block 481,823']);
  });

  it('an address: balance big, received and sent, its latest transactions signed', () => {
    const address = chainCard(
      'BitcoinAddress',
      'btc:address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      { balance: '5771052471', received: '5771152471', tx_count: '67479', unconfirmed_tx_count: '0' },
      {
        name: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        related: [
          { rel: 'tx', uri: `btc:tx/${TXID}`, amount_sat: 5000, at: '2026-11-10T03:32:51Z' },
          { rel: 'tx', uri: `btc:tx/${FUNDING}`, amount_sat: -100_000, at: '2026-11-09T03:32:51Z' },
          { rel: 'tx', uri: `btc:tx/${BLOCK}`, amount_sat: 0, at: null },
        ],
      },
    );
    const view = getChainView(address, LOCALE)!;
    expect(view.title).toBeNull();
    expect(view.figure).toBe('57.71 BTC');
    expect(view.lines.map(text)).toEqual(['Received 57.71 BTC · Sent 100,000 sats · 67,479 transactions']);
    expect(text(view.compact)).toBe('57.71 BTC · 67,479 transactions');
    expect(view.lists[0].title).toBe('Latest transactions');
    expect(view.lists[0].more).toBe(67_476);
    expect(view.lists[0].rows.map((row) => [row.lead, row.link?.label, row.amount, row.sign])).toEqual([
      ['Nov 10, 2026', '3d365b…e46fd5', '+5,000 sats', 'in'],
      ['Nov 9, 2026', 'a7f10c…50d4f5', '−100,000 sats', 'out'],
      ['Unconfirmed', '000000…7f9893', '0 sats', null],
    ]);
    // Pinakes' own total (with unconfirmed transactions) wins over the fact.
    const withPending = getChainView({ ...address, related_total: { tx: 67_482 } }, LOCALE)!;
    expect(withPending.lists[0].more).toBe(67_479);
    expect(view.shownFacts).not.toContain('unconfirmed_tx_count');
  });

  it('a long address in the title is shortened', () => {
    const p2tr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
    const view = getChainView(chainCard('BitcoinAddress', `btc:address/${p2tr}`, {}, { name: p2tr }), LOCALE)!;
    expect(view.title).toBe('bc1p5d…xg3297');
    expect(view.copy?.value).toBe(p2tr);
  });

  it('a Lightning node: channels and capacity, its biggest channels opening their peers', () => {
    const node = chainCard(
      'LightningNode',
      `ln:node/${ACINQ}`,
      { alias: 'ACINQ', capacity: '36094691466', channels: '1833', public_key: ACINQ },
      {
        name: 'ACINQ',
        related: [
          { rel: 'channel', uri: 'ln:channel/892785849701564416', name: 'bfx-lnd0', amount_sat: 500_000_000 },
          { rel: 'channel', uri: 'ln:channel/1', name: null, amount_sat: 100_000_000 },
          { rel: 'peer', uri: `ln:node/${BFX}`, name: 'bfx-lnd0' },
        ],
      },
    );
    const view = getChainView(node, LOCALE)!;
    expect(view.lines.map(text)).toEqual(['1,833 channels · 360.95 BTC capacity']);
    expect(view.copy).toEqual({ label: 'Copy node public key', value: ACINQ });
    expect(view.lists).toHaveLength(1);
    expect(view.lists[0].rows.map((row) => [row.link?.label, row.link?.href, row.amount, row.share])).toEqual([
      ['bfx-lnd0', route(`ln:node/${BFX}`), '5 BTC', 100],
      // No peer known by name: the channel itself.
      ['1', route('ln:channel/1'), '1 BTC', 20],
    ]);
    expect(view.lists[0].more).toBe(1831);
  });

  it('a Lightning channel: both nodes and its funding transaction linked, on its own network', () => {
    const facts = {
      capacity: '500000000',
      funding_tx: FUNDING,
      node1: ACINQ,
      node1_alias: 'ACINQ',
      node2: BFX,
      node2_alias: 'bfx-lnd0',
      status: 'active',
    };
    const view = getChainView(chainCard('LightningChannel', 'ln:channel/892785849701564416', facts), LOCALE)!;
    expect(view.lines.map(text)).toEqual(['ACINQ ↔ bfx-lnd0', '5 BTC · Active · Funding a7f10c…50d4f5']);
    expect(links(view.lines).map((item) => item.href)).toEqual([
      route(`ln:node/${ACINQ}`),
      route(`ln:node/${BFX}`),
      route(`btc:tx/${FUNDING}`),
    ]);
    expect(text(view.compact)).toBe('ACINQ ↔ bfx-lnd0 · 5 BTC');

    const closed = getChainView(
      chainCard('LightningChannel', 'ln:channel/892785849701564416', facts, {
        related: [{ rel: 'closing_tx', uri: `btc:tx/${TXID}` }],
      }),
      LOCALE,
    )!;
    expect(text(closed.lines[1])).toBe('5 BTC · Active · Funding a7f10c…50d4f5 · Closed by 3d365b…e46fd5');

    const testnet = getChainView(chainCard('LightningChannel', 'ln-testnet:channel/1', facts), LOCALE)!;
    expect(links(testnet.lines).map((item) => item.href)).toEqual([
      route(`ln-testnet:node/${ACINQ}`),
      route(`ln-testnet:node/${BFX}`),
      route(`btc-testnet:tx/${FUNDING}`),
    ]);
  });
});

describe('formatters', () => {
  it('a fee rate in sat/vB', () => {
    expect(formatFeeRate('118488', '59057', LOCALE)).toBe('2.01 sat/vB');
    expect(formatFeeRate('118488', '0', LOCALE)).toBeNull();
  });

  it('an ID shortened in the middle', () => {
    expect(shortenChainId(TXID)).toBe('3d365b…e46fd5');
  });
});
