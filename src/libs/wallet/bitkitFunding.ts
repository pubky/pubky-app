import { type Network, parsePayment } from '@beignet/wallet-core';
import type { PaymentEndpoint } from '@coreyphillips/paykit-discovery';
import { NetworkErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { endpointValue, paymentIdentity } from '@/libs/wallet/resolveRecipient';

const operation = { service: ErrorService.Homeserver, operation: 'readBitkitFundingAddress' };
const scriptTypes = new Map([
  ['p2tr', 'Taproot'],
  ['p2wpkh', 'SegWit'],
  ['p2sh', 'P2SH'],
  ['p2pkh', 'Legacy'],
]);

export async function getBitkitFundingAddress(account: string, network: Network): Promise<string> {
  const pubky = paymentIdentity(account);
  if (!pubky)
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Sign in to Pubky to find your Bitkit address.', operation);
  let entries: PaymentEndpoint[];
  try {
    const { getPaymentList } = await import('@coreyphillips/paykit-discovery');
    entries = await getPaymentList(pubky);
  } catch {
    throw Err.network(
      NetworkErrorCode.CONNECTION_FAILED,
      'Could not read your public Bitkit payment details.',
      operation,
    );
  }
  const prefix = 'btc-' + (network === 'mainnet' ? 'bitcoin' : network) + '-';
  for (const entry of entries) {
    if (entry.appId !== 'bitkit' || !entry.identifier.startsWith(prefix)) continue;
    const expected = scriptTypes.get(entry.identifier.slice(prefix.length));
    if (!expected) continue;
    const value = endpointValue(entry.payload);
    // Accept only a bare address. URI parameters and invoices cannot direct a
    // deposit obtained from the signed-in buyer's public Bitkit namespace.
    if (!/^[A-Za-z0-9]+$/.test(value)) continue;
    const payment = parsePayment(value, { network });
    if (payment.kind === 'onchain' && 'addressType' in payment && payment.addressType === expected)
      return payment.address;
  }
  throw Err.validation(
    ValidationErrorCode.INVALID_INPUT,
    'Your Bitkit profile has no public Bitcoin address for this network.',
    operation,
  );
}
