import { describe, expect, it } from 'vitest';
import { effectiveTier, effectiveTierReason } from './effective-tier';

describe('effectiveTier', () => {
  it.each([
    ['read-only', 'read-only', true, 'read-only'],
    ['assisted', 'assisted', true, 'assisted'],
    ['autonomous', 'assisted', true, 'assisted'],
    ['assisted', 'assisted', false, 'read-only'],
    ['autonomous', 'assisted', false, 'read-only'],
  ] as const)('caps %s at %s with session coverage=%s', (desired, ceiling, sessionCoversPubchi, expected) => {
    expect(effectiveTier({ desired, ceiling, sessionCoversPubchi })).toBe(expected);
  });

  it('explains a session capability downgrade', () => {
    expect(effectiveTierReason({ desired: 'assisted', ceiling: 'assisted', sessionCoversPubchi: false })).toContain(
      'read-only',
    );
  });
});
