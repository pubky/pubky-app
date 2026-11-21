// @vitest-environment node
import { type EmbeddedRuntimeRequest, EmbeddedWalletClient, parsePayment } from '@beignet/wallet-core';
import { bech32 } from 'bech32';
import { expect, it, vi } from 'vitest';

const primary = '02' + '12'.repeat(32);
const paymentHash = 'ab'.repeat(32);
const address = bech32.encode('bc', [0, ...bech32.toWords(new Uint8Array(20).fill(7))]);
const invoice = (hrp: string) => bech32.encode(hrp, Array(111).fill(0), 1000);
const walletId = 'test-wallet';
const scoped = '/wallets/' + walletId + '/api';
const terms = { lspPubkey: primary, flatFeeSat: 10, feePpm: 101 };

function fixture({
  inbound = 0,
  quote = {},
  issued = {},
  quoteError,
  fundingCap,
}: {
  inbound?: number;
  quote?: Record<string, unknown>;
  issued?: Record<string, unknown>;
  quoteError?: Error;
  fundingCap?: number;
} = {}) {
  const runtime = {
    request: vi.fn(({ method, path, body }: EmbeddedRuntimeRequest) => {
      const url = new URL(path, 'https://wallet.test');
      const route = url.pathname.replace(scoped, '');
      switch (route) {
        case '/api/wallets/' + walletId:
          return { network: 'mainnet', lfbw: { enabled: true, primaryPubkey: primary, setup: 'ready' } };
        case '/channels':
          return inbound
            ? [
                {
                  channelId: 'live',
                  peerPubkey: primary,
                  state: 'NORMAL',
                  htlcUsable: true,
                  remoteBalanceSats: inbound,
                },
              ]
            : [];
        case '/peers':
          return [{ pubkey: primary, state: 'ready' }];
        case '/jit/quote': {
          if (quoteError) throw quoteError;
          const amount = url.searchParams.get('amountSats');
          const cap = amount === null ? 1_000_000 : Number(amount);
          if (fundingCap != null && cap > fundingCap) {
            return {
              accepted: false,
              withinCeilings: true,
              reason: 'the provider does not hold enough on-chain funds to front this receive right now',
            };
          }
          return {
            ...terms,
            amountSats: amount === null ? null : Number(amount),
            accepted: true,
            withinCeilings: true,
            feeSats: terms.flatFeeSat + Math.ceil((cap * terms.feePpm) / 1_000_000),
            ...quote,
          };
        }
        case '/address/new':
          return { address };
        case '/invoice/create':
        case '/jit/invoice':
          return {
            ...terms,
            paymentHash,
            feeMode: 'skim',
            maxAmountSats: body && typeof body === 'object' && 'maxAmountSats' in body ? body.maxAmountSats : undefined,
            bolt11: invoice(body && typeof body === 'object' && 'amountSats' in body ? 'lnbc100u' : 'lnbc'),
            ...issued,
          };
        case '/invoice/decode':
          return { paymentHash, timestamp: Math.floor(Date.now() / 1000), expiry: 600 };
        case '/direct-funding/request':
          return {};
        case '/receive/requests':
          if (method === 'POST' && body && typeof body === 'object' && 'request' in body)
            return { request: body.request };
          throw Error('Unexpected receive request');
        default:
          throw Error('Unexpected route ' + method + ' ' + route);
      }
    }),
  };
  const requests = () => runtime.request.mock.calls.map(([request]) => request);
  const posted = (route: string) => requests().filter((call) => call.method === 'POST' && call.path === scoped + route);
  return { client: new EmbeddedWalletClient({ runtime, walletId }), requests, posted };
}

it('reviews an amountless first invoice and pins the primary and fee schedule when creating it', async () => {
  const { client, requests, posted } = fixture();
  const quote = await client.quoteReceive({ description: 'Coffee' });
  expect(quote).toMatchObject({
    amountSats: null,
    netSats: null,
    feeSats: 111,
    jitFee: { flatFeeSats: 10, feePpm: 101, maxFeeSats: 111 },
  });
  const query = new URL(requests().find((call) => call.path.includes('/jit/quote'))!.path, 'https://wallet.test')
    .searchParams;
  expect(query.has('amountSats')).toBe(false);
  expect(query.get('lspPubkey')).toBe(primary);
  expect(posted('/jit/invoice')).toHaveLength(0);
  const request = await client.receive(quote);
  expect(posted('/jit/invoice')[0].body).toEqual({
    description: 'Coffee',
    expirySecs: 600,
    lspPubkey: primary,
    targetRemainingInboundSat: Number(query.get('targetRemainingInboundSat')),
    feeMode: 'skim',
    maxFlatFeeSat: 10,
    maxAmountSats: 1_000_000,
    maxFeePpm: 101,
  });
  expect(request).toMatchObject({ amountSats: null, feeSats: 111, paymentHash });
  expect(parsePayment(request.bolt11, { network: 'mainnet' })).toMatchObject({ kind: 'bolt11', amountSats: null });
  expect(new URL(request.uri).searchParams.has('amount')).toBe(false);
  expect(request.warnings).toContainEqual(expect.stringContaining('up to 111 sats'));
  expect(posted('/receive/requests')).toHaveLength(1);
});

it('preserves plain amountless receives over existing capacity and fixed quotes for the first payment', async () => {
  const funded = fixture({ inbound: 1 });
  const plain = await funded.client.quoteReceive({});
  expect(plain.jitFee).toBeUndefined();
  expect((await funded.client.receive(plain)).amountSats).toBeNull();
  expect(funded.posted('/invoice/create')).toHaveLength(1);
  expect(funded.requests().some((call) => call.path.includes('/jit/'))).toBe(false);

  const fresh = fixture();
  const fixed = await fresh.client.quoteReceive({ amountSats: 10000 });
  expect(fixed).toMatchObject({ amountSats: 10000, feeSats: 12, netSats: 9988 });
  expect(fixed.jitFee).toBeUndefined();
  expect((await fresh.client.receive(fixed)).feeSats).toBe(12);
  expect(fresh.posted('/jit/invoice')[0].body).toHaveProperty('amountSats', 10000);
});

it('accepts a zero-fee first request without quoting a fixed face amount', async () => {
  const zero = { flatFeeSat: 0, feePpm: 0, feeSats: 0 };
  const { client } = fixture({ quote: zero, issued: zero });
  const quote = await client.quoteReceive({});
  expect(quote.jitFee).toEqual({ flatFeeSats: 0, feePpm: 0, maxFeeSats: 0, maxReceivableSats: 1_000_000 });
  expect((await client.receive(quote)).feeSats).toBe(0);
});

it.each([
  { flatFeeSat: 11, feePpm: 100 },
  { flatFeeSat: 9, feePpm: 102 },
  { feeMode: 'hop' },
  { maxAmountSats: undefined },
  { maxAmountSats: 2_000_000 },
  { lspPubkey: '03' + 'fa'.repeat(32) },
])('does not share an amountless invoice after a change in reviewed terms', async (issued) => {
  const { client, posted } = fixture({ issued });
  await expect(client.receive(await client.quoteReceive({}))).rejects.toMatchObject({ code: 'FEE_CHANGED' });
  expect(posted('/receive/requests')).toHaveLength(0);
});

it.each([
  { feeSats: undefined },
  { feeSats: 1 },
  { flatFeeSat: undefined },
  { feePpm: -1 },
  { amountSats: 5000 },
  { lspPubkey: undefined },
])('rejects incomplete or contradictory terms before creating an invoice', async (quote) => {
  const { client, posted } = fixture({ quote });
  await expect(client.quoteReceive({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(posted('/jit/invoice')).toHaveLength(0);
});

it('keeps a real capacity refusal actionable and transport failures distinct', async () => {
  const { client, posted } = fixture({
    quote: { accepted: false, reason: 'the provider funds at most 10000 sats for one receive' },
  });
  await expect(client.quoteReceive({})).rejects.toMatchObject({
    code: 'RECEIVE_UNAVAILABLE',
    message: expect.stringContaining('Enter a fixed amount'),
  });
  expect(posted('/jit/invoice')).toHaveLength(0);
  const timeout = fixture({ quoteError: Object.assign(Error('timeout'), { code: 'JIT_TIMEOUT' }) });
  await expect(timeout.client.quoteReceive({})).rejects.toMatchObject({
    code: 'JIT_TIMEOUT',
    message: expect.not.stringContaining('fixed amount'),
  });
});

it('resizes only the receive intent and creates a single payer-selected invoice', async () => {
  const { client, posted, requests } = fixture({ fundingCap: 50_000 });
  const quote = await client.quoteReceive({});
  expect(
    requests()
      .filter(({ path }) => path.includes('/jit/quote'))
      .map(({ path }) => new URL(path, 'https://wallet.test').searchParams.get('amountSats')),
  ).toEqual([null, '100000', '50000']);
  expect(quote).toMatchObject({
    amountSats: null,
    netSats: null,
    jitFee: { flatFeeSats: 10, feePpm: 101, maxFeeSats: 16, maxReceivableSats: 50_000 },
  });
  const request = await client.receive(quote);
  expect(posted('/jit/invoice')).toHaveLength(1);
  expect(posted('/jit/invoice')[0].body).toHaveProperty('maxAmountSats', 50_000);
  expect(posted('/jit/invoice')[0].body).not.toHaveProperty('amountSats');
  expect(parsePayment(request.bolt11, { network: 'mainnet' })).toMatchObject({ kind: 'bolt11', amountSats: null });
  expect(request.warnings).toContain('The sender can pay up to 50,000 sats over Lightning.');
});

it.each([
  { accepted: false, reason: 'the provider has its maximum number of channel fundings in flight; try again shortly' },
  { accepted: true, withinCeilings: false },
])('does not retry quotes declined for another reason', async (answer) => {
  const { client, requests } = fixture({ quote: answer });
  await expect(client.quoteReceive({})).rejects.toMatchObject({ code: 'RECEIVE_UNAVAILABLE' });
  expect(requests().filter(({ path }) => path.includes('/jit/quote'))).toHaveLength(1);
});
