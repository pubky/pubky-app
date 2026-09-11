const satsFormatter = new Intl.NumberFormat('en-US');
const INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
const MAX_SAFE_SATS = BigInt(Number.MAX_SAFE_INTEGER);

interface FormatSatsOptions {
  symbol?: boolean;
  space?: boolean;
}

/** Formats a non-negative, safe-integer satoshi amount; invalid amounts return null. */
export function formatSats(
  amount: number | string,
  { symbol = true, space = false }: FormatSatsOptions = {},
): string | null {
  let sats: bigint;

  if (typeof amount === 'number') {
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    sats = BigInt(amount);
  } else {
    if (!INTEGER_PATTERN.test(amount)) return null;
    sats = BigInt(amount);
    if (sats > MAX_SAFE_SATS) return null;
  }

  const formatted = satsFormatter.format(sats);
  if (!symbol) return formatted;
  return `₿${space ? ' ' : ''}${formatted}`;
}
