import { describe, expect, it } from 'vitest';
import { formatLockPrice, parseLockPrice } from './lockPrice';

describe('lock prices', () => {
  it.each([
    ['BTC', '1234', '1234', '₿1,234'],
    ['USD', '12.34', '1234', '$12.34'],
    ['USD', '0.01', '1', '$0.01'],
    ['BTC', '18446744073709551615', '18446744073709551615', '₿18,446,744,073,709,551,615'],
  ] as const)('converts %s %s to exact atomic units and formats them', (asset, input, amount, shown) => {
    expect(parseLockPrice(input, asset)).toEqual({ amount, asset });
    expect(formatLockPrice({ amount, asset })).toBe(shown);
  });

  it.each([
    ['BTC', '1.5'],
    ['USD', '0.001'],
    ['USD', '-1'],
    ['USD', '1e6'],
    ['USD', ''],
    ['BTC', '0'],
    ['USD', 'abc'],
    ['USD', '1,234'],
    ['BTC', '18446744073709551616'],
    ['USD', '184467440737095516.16'],
  ] as const)('rejects unrepresentable %s price %j without rounding', (asset, input) => {
    expect(parseLockPrice(input, asset)).toBeNull();
  });
});
