import { beforeEach, expect, it, vi } from 'vitest';
import { resolveRecipient } from '@/libs/wallet/resolveRecipient';
import {
  quoteWalletMaximum,
  reviewWalletDrain,
  reviewWalletPayment,
  WalletDrainAvailable,
} from '@/libs/wallet/sendPayment';

vi.mock('@/libs/wallet/resolveRecipient', () => ({ resolveRecipient: vi.fn() }));
const client = {
  quoteMax: vi.fn(),
  prepareSend: vi.fn(),
  snapshot: vi.fn(),
  prepareDrain: vi.fn(),
  cancelDrain: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  client.snapshot.mockResolvedValue({ balance: { totalSats: 4930 } });
  vi.mocked(resolveRecipient).mockResolvedValue({ destination: 'amountless-invoice', pubky: 'payee' });
  client.quoteMax.mockResolvedValue({ amountSats: 4950, keptSats: 0, keptReason: 'none' });
});

it('reviews the selected Paykit endpoint as Max with a fresh price and without submitting', async () => {
  const maximum = await quoteWalletMaximum(client, '  payee  ', 'regtest');
  vi.mocked(resolveRecipient).mockResolvedValue({ destination: 'replacement-invoice', pubky: 'payee' });
  const review = { id: 'held', route: 'lightning', minRecipientSats: 4880, debitMsat: '4930000', totalSats: 4930 };
  client.prepareSend.mockResolvedValue(review);
  expect(await reviewWalletPayment(client, 'payee', 'regtest', undefined, maximum)).toEqual({
    payment: review,
    destination: 'amountless-invoice',
    recipient: 'payee',
  });
  expect(client.quoteMax).toHaveBeenCalledWith({ request: 'amountless-invoice' });
  expect(client.prepareSend).toHaveBeenCalledWith({ request: 'amountless-invoice', max: true });
  expect(resolveRecipient).toHaveBeenCalledTimes(1);
});

it('requires a new quote after a change of account, network or recipient', async () => {
  const maximum = await quoteWalletMaximum(client, 'payee', 'regtest');
  for (const promise of [
    reviewWalletPayment({ ...client }, 'payee', 'regtest', undefined, maximum),
    reviewWalletPayment(client, 'payee', 'testnet', undefined, maximum),
    reviewWalletPayment(client, 'another payee', 'regtest', undefined, maximum),
  ]) {
    await expect(promise).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
  }
  await expect(reviewWalletPayment(client, 'payee', 'regtest', '5000', maximum)).rejects.toMatchObject({
    code: 'AMOUNT_CONFLICT',
  });
  expect(client.prepareSend).not.toHaveBeenCalled();
});

it('preserves a refused quote and leaves fixed-amount payments on their original path', async () => {
  client.quoteMax.mockRejectedValue(Object.assign(new Error('Fixed invoice'), { code: 'MAX_FIXED_AMOUNT' }));
  await expect(quoteWalletMaximum(client, 'payee', 'regtest')).rejects.toMatchObject({ code: 'MAX_FIXED_AMOUNT' });
  await reviewWalletPayment(client, 'payee', 'regtest', '2500');
  expect(client.prepareSend).toHaveBeenCalledWith({ request: 'amountless-invoice', amountSats: '2500' });
});

const address = 'bcrt1qqyqszqgpqyqszqgpqyqszqgpqyqszqgpvxat9t';

it('requires an explicit second review before a reserve can be emptied to an address', async () => {
  vi.mocked(resolveRecipient).mockResolvedValue({ destination: address });
  client.quoteMax.mockResolvedValue({ amountSats: 3900, keptSats: 1000, keptReason: 'reserve' });
  const offer = await quoteWalletMaximum(client, address, 'regtest').catch((error) => error);
  expect(offer).toBeInstanceOf(WalletDrainAvailable);
  expect(offer).toMatchObject({ retainedSats: 1000, keptReason: 'reserve', address });
  expect(client.prepareDrain).not.toHaveBeenCalled();
  client.prepareDrain.mockResolvedValue({ method: 'drain', totalSats: 4930 });
  await expect(reviewWalletDrain(client, address, 'regtest', offer)).resolves.toMatchObject({
    payment: { method: 'drain' },
    destination: address,
  });
  expect(client.prepareDrain).toHaveBeenCalledWith({ address });
  await expect(reviewWalletDrain(client, 'different', 'regtest', offer)).rejects.toMatchObject({
    code: 'QUOTE_EXPIRED',
  });
});

it('checks the whole reviewed debit, including loose coins outside a waived channel', async () => {
  vi.mocked(resolveRecipient).mockResolvedValue({ destination: address });
  client.prepareSend.mockResolvedValue({ amountSats: 4900, totalSats: 4930, keptSats: 0 });
  client.snapshot.mockResolvedValue({ balance: { totalSats: 5000 } });
  const maximum = await quoteWalletMaximum(client, address, 'regtest');
  const offer = await reviewWalletPayment(client, address, 'regtest', undefined, maximum).catch((error) => error);
  expect(offer).toBeInstanceOf(WalletDrainAvailable);
  expect(offer.retainedSats).toBe(70);
  client.prepareDrain.mockResolvedValue({ id: 'left-behind', totalSats: 4900 });
  await expect(reviewWalletDrain(client, address, 'regtest', offer)).rejects.toMatchObject({
    code: 'MAX_LEAVES_FUNDS',
  });
  expect(client.cancelDrain).toHaveBeenCalledWith('left-behind');
});

it('prevents an automatic channel close for a fixed-amount request', async () => {
  vi.mocked(resolveRecipient).mockResolvedValue({ destination: 'bitcoin:' + address + '?amount=0.01' });
  client.quoteMax.mockResolvedValue({ amountSats: 3900, keptSats: 1000, keptReason: 'reserve' });
  await expect(quoteWalletMaximum(client, address, 'regtest')).rejects.toMatchObject({ code: 'MAX_LEAVES_FUNDS' });
  expect(client.prepareDrain).not.toHaveBeenCalled();
});
