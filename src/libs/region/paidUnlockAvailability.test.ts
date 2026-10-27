import { describe, expect, it } from 'vitest';
import { type ClientRegionState, evaluatePaidUnlockAvailability } from './paidUnlockAvailability';
import { createRegionPolicy, OPEN_REGION_POLICY, parseRegionModes, type RegionPolicy } from './regionModes';

function policyOf(raw: string): RegionPolicy {
  const parsed = parseRegionModes(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return createRegionPolicy(parsed.entries);
}

const LAUNCH = policyOf('EU=blocked,GB=blocked,US=blocked');
const ready = (country: string | null): ClientRegionState => ({ status: 'ready', country });
const AVAILABLE = { status: 'available' };

describe('evaluatePaidUnlockAvailability', () => {
  it('holds a viewer in the EU, the UK or the US at launch', () => {
    for (const country of ['DE', 'FR', 'GB', 'US']) {
      expect(evaluatePaidUnlockAvailability(LAUNCH, ready(country))).toEqual({ status: 'blocked', cause: 'region' });
    }
  });

  it('lets a viewer anywhere else pay and create paid locks', () => {
    for (const country of ['CH', 'NO', 'JP', 'CA', 'BR']) {
      expect(evaluatePaidUnlockAvailability(LAUNCH, ready(country))).toEqual(AVAILABLE);
    }
  });

  it('holds a nuanced region too, because the Lock Server answers 451 there as well', () => {
    const nuanced = policyOf('EU=nuanced,GB=nuanced');
    expect(evaluatePaidUnlockAvailability(nuanced, ready('DE'))).toEqual({ status: 'blocked', cause: 'region' });
    expect(evaluatePaidUnlockAvailability(nuanced, ready('US'))).toEqual(AVAILABLE);
  });

  describe('a country the edge could not tell', () => {
    it('is held while unknown viewers are held, which is the strictest mode in force', () => {
      expect(evaluatePaidUnlockAvailability(LAUNCH, ready(null))).toEqual({ status: 'blocked', cause: 'unknown' });
    });

    it('is let through once UNKNOWN is open', () => {
      expect(evaluatePaidUnlockAvailability(policyOf('US=blocked,UNKNOWN=open'), ready(null))).toEqual(AVAILABLE);
    });
  });

  it('waits while the region is being read, and only when the deployment lists a region', () => {
    expect(evaluatePaidUnlockAvailability(LAUNCH, { status: 'loading' })).toEqual({ status: 'checking' });
    expect(evaluatePaidUnlockAvailability(OPEN_REGION_POLICY, { status: 'loading' })).toEqual(AVAILABLE);
  });

  // The check is advisory: the Lock Server's 451 still lands on its own state, so a Shop that cannot
  // answer must not switch paid unlocks off for everyone.
  it('lets a viewer through when the region could not be read at all', () => {
    expect(evaluatePaidUnlockAvailability(LAUNCH, { status: 'failed' })).toEqual(AVAILABLE);
  });

  it('changes nothing for a deployment with no region list', () => {
    for (const client of [ready('US'), ready('DE'), ready(null), { status: 'failed' } as const]) {
      expect(evaluatePaidUnlockAvailability(OPEN_REGION_POLICY, client)).toEqual(AVAILABLE);
    }
  });
});
