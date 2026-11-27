import { describe, expect, it } from 'vitest';
import { compareEpochs, contactEpoch, countedEpoch, isEpoch, newestEpoch, NO_EPOCH, restoreEpoch } from './epoch';

describe('epochs', () => {
  it('names each first contact and each restore apart, even at the same time', () => {
    const names = [contactEpoch(5), contactEpoch(5), restoreEpoch(NO_EPOCH, 5), restoreEpoch(NO_EPOCH, 5)];

    expect(new Set(names).size).toBe(4);
    expect(names.every(isEpoch)).toBe(true);
    expect([NO_EPOCH, countedEpoch(3)].every(isEpoch)).toBe(true);
    expect(['x', 'c5', 'r5.', 'r5.A', '-1'].some(isEpoch)).toBe(false);
  });

  it('orders any restore after any first contact, a later restore and an earlier contact last', () => {
    const early = contactEpoch(1000);
    const late = contactEpoch(2000);
    const r1 = restoreEpoch(early, 1000);
    const r2 = restoreEpoch(late, 2000);

    expect(newestEpoch([NO_EPOCH, countedEpoch(9), late, early])).toBe(early);
    expect(newestEpoch([early, r1])).toBe(r1);
    expect(newestEpoch([r2, r1, early])).toBe(r2);
    expect(compareEpochs(countedEpoch(1), countedEpoch(2))).toBeLessThan(0);
    expect(compareEpochs(NO_EPOCH, countedEpoch(0))).toBeLessThan(0);
    expect(compareEpochs(r1, r1)).toBe(0);
    expect(newestEpoch([])).toBe(NO_EPOCH);
  });

  it('names a restore after the one it follows, whatever the clock says', () => {
    const first = restoreEpoch(NO_EPOCH, 5000);
    const next = restoreEpoch(first, 10);

    expect(compareEpochs(next, first)).toBeGreaterThan(0);
  });
});
