import {
  type KeptReason,
  type MaxQuote,
  type Network,
  parsePayment,
  type WalletClientInterface,
  WalletError,
} from '@beignet/wallet-core';
import { bitcoinAmount } from '@/libs/wallet/amount';
import { resolveRecipient } from '@/libs/wallet/resolveRecipient';

type SendClient = Pick<WalletClientInterface, 'prepareSend' | 'quoteMax' | 'prepareDrain' | 'cancelDrain' | 'snapshot'>;

interface WalletTarget {
  input: string;
  destination: string;
  network: Network;
  belongsTo(client: SendClient): boolean;
  pubky?: string;
}

export interface WalletMaximum extends WalletTarget {
  quote: MaxQuote;
}

export class WalletDrainAvailable extends WalletError {
  constructor(
    readonly target: WalletTarget,
    readonly address: string,
    message: string,
    readonly retainedSats?: number,
    readonly keptReason?: KeptReason,
  ) {
    super(message, 'MAX_DRAIN_AVAILABLE');
  }
}

function requireSameTarget(target: WalletTarget, client: SendClient, input: string, network: Network) {
  if (!target.belongsTo(client) || target.input !== input.trim() || target.network !== network) {
    throw new WalletError('The wallet or destination changed. Request a new maximum.', 'QUOTE_EXPIRED');
  }
}

function drainAddress(target: WalletTarget) {
  const parsed = parsePayment(target.destination, { network: target.network });
  if (parsed.kind === 'onchain' && parsed.amountSats == null && !parsed.lightning && !parsed.funding)
    return parsed.address;
}

function declinePartialMax(target: WalletTarget, retainedSats: number, keptReason?: KeptReason): never {
  const amount = bitcoinAmount(retainedSats);
  const message =
    keptReason === 'reserve'
      ? 'The channel reserve requires keeping ' + amount + '.'
      : keptReason === 'commitment-cost'
        ? 'The channel commitment costs require keeping ' + amount + '.'
        : 'This payment would leave ' + amount + ' in the wallet.';
  const address = drainAddress(target);
  if (address) throw new WalletDrainAvailable(target, address, message, retainedSats, keptReason);
  throw new WalletError(message, 'MAX_LEAVES_FUNDS');
}

async function targetFor(client: SendClient, input: string, network: Network): Promise<WalletTarget> {
  const request = input.trim();
  return {
    input: request,
    network,
    belongsTo: (candidate) => candidate === client,
    ...(await resolveRecipient(request, network)),
  };
}

export async function quoteWalletMaximum(client: SendClient, input: string, network: Network): Promise<WalletMaximum> {
  const target = await targetFor(client, input, network);
  let quote: MaxQuote;
  try {
    quote = await client.quoteMax({ request: target.destination });
  } catch (error) {
    if (error instanceof WalletError && ['NO_CHANNEL', 'INSUFFICIENT_FUNDS', 'INVALID_AMOUNT'].includes(error.code)) {
      const address = drainAddress(target);
      if (address) throw new WalletDrainAvailable(target, address, error.message);
    }
    throw error;
  }
  if (quote.keptSats > 0) declinePartialMax(target, quote.keptSats, quote.keptReason);
  return { ...target, quote };
}

export async function reviewWalletPayment(
  client: SendClient,
  input: string,
  network: Network,
  amountSats?: string | number,
  maximum?: WalletMaximum | null,
) {
  if (maximum) {
    requireSameTarget(maximum, client, input, network);
    if (amountSats !== undefined && amountSats !== '') {
      throw new WalletError('Choose an amount or Max.', 'AMOUNT_CONFLICT');
    }
  }
  // The payee can change their payment list between preview and confirmation.
  // Keep the selected endpoint and ask the engine to reprice it for this review.
  const target = maximum ?? (await targetFor(client, input, network));
  const payment = await client.prepareSend(
    maximum
      ? { request: target.destination, max: true }
      : { request: target.destination, amountSats: amountSats === '' ? undefined : amountSats },
  );
  if (maximum) {
    const snapshot = await client.snapshot();
    // The SDK Max quote covers sendable channels. A wallet may also hold
    // coins, funds in flight, another channel or a negotiated reserve.
    const left = Math.max(payment.keptSats ?? 0, snapshot.balance.totalSats - payment.totalSats);
    if (left > 0) declinePartialMax(target, left, left === payment.keptSats ? payment.keptReason : undefined);
  }
  return { payment, destination: target.destination, recipient: target.pubky };
}

export async function reviewWalletDrain(
  client: SendClient,
  input: string,
  network: Network,
  offer: WalletDrainAvailable,
) {
  requireSameTarget(offer.target, client, input, network);
  const snapshot = await client.snapshot();
  const payment = await client.prepareDrain({ address: offer.address });
  if (payment.totalSats < snapshot.balance.totalSats) {
    await client.cancelDrain(payment.id);
    throw new WalletError(
      'Some funds are still unavailable. Wait for them to settle before emptying this wallet.',
      'MAX_LEAVES_FUNDS',
    );
  }
  return { payment, destination: offer.target.destination, recipient: offer.target.pubky };
}
