import { lockPriceSchema, type TLockPrice, type TLockPriceAsset } from '@/services/locks/locks.types';

const inputDecimals = { BTC: 0, USD: 2 } as const;
const integerFormatter = new Intl.NumberFormat('en-US');

/** BTC is entered in sats; dollar prices are entered in USD. */
export function parseLockPrice(value: string, asset: TLockPriceAsset): TLockPrice | null {
  const decimals = inputDecimals[asset];
  if (!new RegExp(`^\\d{1,20}(?:\\.\\d{0,${decimals}})?$`).test(value) || (asset === 'BTC' && value.includes('.')))
    return null;
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole + fraction.padEnd(decimals, '0')).toString();
  const price = lockPriceSchema.safeParse({ amount, asset });
  return price.success ? price.data : null;
}

/** Whole units and the zero-padded fraction the asset's decimals call for (empty for BTC). */
const splitLockPrice = ({ amount, asset }: TLockPrice) => {
  const decimals = inputDecimals[asset];
  const units = BigInt(amount);
  const scale = BigInt(10) ** BigInt(decimals);
  return { whole: units / scale, fraction: decimals ? (units % scale).toString().padStart(decimals, '0') : '' };
};

/** The reverse of `parseLockPrice`: the amount as the price field takes it, without grouping or symbol. */
export function lockPriceInputValue(price: TLockPrice): string {
  const { whole, fraction } = splitLockPrice(price);
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatLockPrice(price: TLockPrice, { space = false } = {}): string {
  const { whole, fraction } = splitLockPrice(price);
  if (price.asset === 'BTC') return `₿${space ? ' ' : ''}${integerFormatter.format(whole)}`;
  return `$${integerFormatter.format(whole)}.${fraction}`;
}
