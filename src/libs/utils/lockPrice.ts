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

export function formatLockPrice({ amount, asset }: TLockPrice, { space = false } = {}): string {
  const units = BigInt(amount);
  if (asset === 'BTC') return `₿${space ? ' ' : ''}${integerFormatter.format(units)}`;
  const decimals = inputDecimals[asset];
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = integerFormatter.format(units / scale);
  const fraction = (units % scale).toString().padStart(decimals, '0');
  return `$${whole}.${fraction}`;
}
