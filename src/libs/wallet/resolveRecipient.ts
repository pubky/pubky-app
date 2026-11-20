import { type Network, parsePayment } from '@beignet/wallet-core';
import type { PaymentEndpoint } from '@coreyphillips/paykit-discovery';
import { bech32 } from 'bech32';
import { NetworkErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

// A Pubky has 256 bits, so its last z-base-32 character has only two possible values.
const identity = /^(?:pubky:\/\/|pubky)?([ybndrfg8ejkmcpqxot1uwisza345h769]{51}[yo])$/;
const operation = { service: ErrorService.Homeserver, operation: 'readPaymentList' };

function endpointValue(payload: string) {
  const text = payload.trim();
  if (!text.startsWith('{')) return text;
  try {
    const value: unknown = JSON.parse(text)?.value;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

// BOLT11 encodes a 35-bit timestamp and an optional 'x' expiry tag in five-bit words.
// The wallet core has already checked the checksum. It checks the signature at review.
function usableInvoice(invoice: string, now: number): boolean {
  const words = bech32.decode(invoice, invoice.length).words;
  const numberOf = (field: number[]) => field.reduce((n, word) => n * 32 + word, 0);
  const timestamp = numberOf(words.slice(0, 7));
  const end = words.length - 104;
  let expirySeconds = 3600;
  for (let pos = 7; pos < end;) {
    if (pos + 3 > end) return false;
    const length = words[pos + 1] * 32 + words[pos + 2];
    const start = pos + 3;
    if (start + length > end) return false;
    if (words[pos] === 6) expirySeconds = numberOf(words.slice(start, start + length));
    pos = start + length;
  }
  return Number.isSafeInteger(expirySeconds) && (timestamp + expirySeconds) * 1000 > now + 60_000;
}

export function selectDestination(endpoints: PaymentEndpoint[], network: Network, now = Date.now()) {
  const chain = 'btc-' + (network === 'mainnet' ? 'bitcoin' : network) + '-';
  const addressTypes = ['p2tr', 'p2wpkh', 'p2pkh', 'p2sh'].map((type) => chain + type);
  let address: string | undefined;
  for (const { identifier, payload } of endpoints) {
    if (identifier !== 'btc-lightning-bolt11' && !addressTypes.includes(identifier)) continue;
    const value = endpointValue(payload);
    const payment = parsePayment(value, { network });
    if (identifier === 'btc-lightning-bolt11' && payment.kind === 'bolt11' && usableInvoice(payment.invoice, now)) {
      return payment.invoice;
    }
    if (addressTypes.includes(identifier) && payment.kind === 'onchain' && !payment.lightning && !payment.funding) {
      address ??= value;
    }
  }
  return address;
}

export async function resolveRecipient(
  input: string,
  network: Network,
): Promise<{ destination: string; pubky?: string }> {
  const destination = input.trim();
  const pubky = identity.exec(destination)?.[1];
  if (!pubky) return { destination };

  let endpoints: PaymentEndpoint[];
  try {
    const { getPaymentList } = await import('@coreyphillips/paykit-discovery');
    endpoints = await getPaymentList(pubky);
  } catch {
    throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Could not read this profile’s payment list.', operation);
  }
  const selected = selectDestination(endpoints, network);
  if (!selected) {
    throw Err.validation(
      ValidationErrorCode.INVALID_INPUT,
      'This profile has no supported payment request on this network.',
      operation,
    );
  }
  return { pubky, destination: selected };
}
