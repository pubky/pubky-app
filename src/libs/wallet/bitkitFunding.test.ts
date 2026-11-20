import { beforeEach, expect, it, vi } from 'vitest';
import { getBitkitFundingAddress } from './bitkitFunding';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('@coreyphillips/paykit-discovery', () => ({ getPaymentList: lookup }));
const pubky = '5jsjx1o6fzu6aeeo697r3i5rx15zq41kikcye8wtwdqm4nb4tryo';
const address = 'bcrt1qqyqszqgpqyqszqgpqyqszqgpqyqszqgpvxat9t';
const mainnet = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const endpoint = (identifier: string, value: string, appId = 'bitkit') => ({
  appId,
  identifier,
  payload: JSON.stringify({ value }),
});
beforeEach(() => vi.resetAllMocks());

it('looks up the buyer once and returns a bare Bitkit address for this network', async () => {
  lookup.mockResolvedValue([
    endpoint('btc-bitcoin-p2wpkh', mainnet),
    endpoint('btc-regtest-p2wpkh', address, 'another-wallet'),
    endpoint('btc-regtest-p2wpkh', address),
  ]);
  await expect(getBitkitFundingAddress('pubky://' + pubky, 'regtest')).resolves.toBe(address);
  expect(lookup).toHaveBeenCalledExactlyOnceWith(pubky);
});

it('accepts a plain-text Bitkit endpoint', async () => {
  lookup.mockResolvedValue([{ appId: 'bitkit', identifier: 'btc-regtest-p2wpkh', payload: address }]);
  await expect(getBitkitFundingAddress(pubky, 'regtest')).resolves.toBe(address);
});

it('rejects wrong publishers, scripts, networks, checksums and payment wrappers', async () => {
  lookup.mockResolvedValue([
    endpoint('btc-regtest-p2wpkh', address, 'bitkit-lookalike'),
    endpoint('btc-regtest-p2tr', address),
    endpoint('btc-regtest-p2wpkh', mainnet),
    endpoint('btc-regtest-p2wpkh', address.slice(0, -2) + 'yy'),
    endpoint('btc-lightning-bolt11', address),
    endpoint('btc-regtest-p2wpkh', 'bitcoin:' + address + '?amount=0.001'),
    endpoint('btc-regtest-p2wpkh', 'bitcoin:' + address),
  ]);
  await expect(getBitkitFundingAddress(pubky, 'regtest')).rejects.toThrow('no public Bitcoin address');
});

it('reports a failed lookup separately from missing published data', async () => {
  lookup.mockRejectedValue(new Error('unreachable'));
  await expect(getBitkitFundingAddress(pubky, 'mainnet')).rejects.toThrow('Could not read');
});

it('rejects an invalid account before looking it up', async () => {
  await expect(getBitkitFundingAddress('not-a-pubky', 'mainnet')).rejects.toThrow('Sign in');
  expect(lookup).not.toHaveBeenCalled();
});
