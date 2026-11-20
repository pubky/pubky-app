import { describe, expect, it, vi } from 'vitest';
import { resolveRecipient, selectDestination } from './resolveRecipient';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('@coreyphillips/paykit-discovery', () => ({ getPaymentList: lookup }));
const identity = '5jsjx1o6fzu6aeeo697r3i5rx15zq41kikcye8wtwdqm4nb4tryo';
const address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const invoice =
  'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql';
const endpoints = [
  { appId: 'test', identifier: 'btc-bitcoin-p2wpkh', payload: address },
  { appId: 'test', identifier: 'btc-lightning-bolt11', payload: JSON.stringify({ value: invoice }) },
];

describe('profile payment destinations', () => {
  it('prefers a live invoice over an address and skips expired invoices', () => {
    expect(selectDestination(endpoints, 'mainnet', 1496314658000)).toBe(invoice);
    expect(selectDestination(endpoints, 'mainnet')).toBe(address);
    expect(selectDestination(endpoints, 'regtest', 1496314658000)).toBeUndefined();
  });

  it('keeps the confirmed identity with the resolved destination', async () => {
    lookup.mockResolvedValue(endpoints);
    await expect(resolveRecipient('pubky://' + identity, 'mainnet')).resolves.toEqual({
      pubky: identity,
      destination: address,
    });
    expect(lookup).toHaveBeenCalledWith(identity);
  });

  it('passes pasted invoices directly to wallet review without contacting a homeserver', async () => {
    lookup.mockClear();
    await expect(resolveRecipient('lightning:' + invoice, 'mainnet')).resolves.toEqual({
      destination: 'lightning:' + invoice,
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});
