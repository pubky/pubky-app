import { describe, expect, it } from 'vitest';
import { createRegionPolicy, EU_27, OPEN_REGION_POLICY, parseRegionModes, type RegionPolicy } from './regionModes';

function policyOf(raw: string): RegionPolicy {
  const parsed = parseRegionModes(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return createRegionPolicy(parsed.entries);
}

const LAUNCH = 'EU=blocked,GB=blocked,US=blocked';

// The grammar is shared with the Shop's `PUBKY_RUNTIME_REGION_MODES` and the service's `REGION_MODES`: these
// cases mirror the Shop's own, so one value means the same thing on every deployment.
describe('parseRegionModes', () => {
  it('parses the launch value', () => {
    expect(parseRegionModes(LAUNCH)).toEqual({
      ok: true,
      entries: [
        { selector: 'EU', mode: 'blocked' },
        { selector: 'GB', mode: 'blocked' },
        { selector: 'US', mode: 'blocked' },
      ],
      canonical: LAUNCH,
    });
  });

  it('parses every later outcome', () => {
    for (const value of [
      'EU=nuanced,GB=nuanced,US=blocked',
      'EU=nuanced,GB=nuanced',
      'EU=nuanced,GB=nuanced,US=open',
      'EU=nuanced,DE=blocked',
      'UNKNOWN=open,US=blocked',
    ]) {
      expect(parseRegionModes(value)).toMatchObject({ ok: true, canonical: value });
    }
  });

  it('reads none as an empty list', () => {
    expect(parseRegionModes('none')).toEqual({ ok: true, entries: [], canonical: 'none' });
    expect(parseRegionModes(' NONE ')).toEqual({ ok: true, entries: [], canonical: 'none' });
  });

  it('accepts any case and spacing and writes the canonical spelling', () => {
    expect(parseRegionModes(' eu = Blocked , gb=NUANCED,unknown = open ')).toEqual({
      ok: true,
      entries: [
        { selector: 'EU', mode: 'blocked' },
        { selector: 'GB', mode: 'nuanced' },
        { selector: 'UNKNOWN', mode: 'open' },
      ],
      canonical: 'EU=blocked,GB=nuanced,UNKNOWN=open',
    });
  });

  it.each([
    ['', 'expected a list'],
    ['   ', 'expected a list'],
    ['EU', 'is not SELECTOR=MODE'],
    ['EU=blocked,', 'is not SELECTOR=MODE'],
    [',EU=blocked', 'is not SELECTOR=MODE'],
    ['EU=blocked=open', 'is not SELECTOR=MODE'],
    ['=blocked', 'is not a two-letter country code'],
    ['EU=', 'is not a mode'],
    ['EU=closed', 'is not a mode'],
    ['USA=blocked', 'is not a two-letter country code'],
    ['U1=blocked', 'is not a two-letter country code'],
    ['UK=blocked', 'use GB'],
    ['none,US=blocked', 'is not SELECTOR=MODE'],
    ['none=blocked', 'is not a two-letter country code'],
    ['EU blocked', 'is not SELECTOR=MODE'],
    ['EU=blocked;US=blocked', 'is not SELECTOR=MODE'],
  ])('rejects %j', (value, fragment) => {
    const parsed = parseRegionModes(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(fragment);
  });
});

describe('createRegionPolicy', () => {
  it('holds the whole of the EU-27, GB and US at launch and leaves everyone else open', () => {
    const policy = policyOf(LAUNCH);
    for (const code of [...EU_27, 'GB', 'US']) expect(policy.modeOf(code)).toBe('blocked');
    for (const code of ['CH', 'NO', 'JP', 'CA', 'AU', 'BR']) expect(policy.modeOf(code)).toBe('open');
    expect(policy.holdsPaidUnlocks).toBe(true);
  });

  it('applies the EU selector to exactly the 27 member states', () => {
    const policy = policyOf('EU=nuanced');
    expect(EU_27).toHaveLength(27);
    expect([...policy.regions.keys()].sort()).toEqual([...EU_27].sort());
    expect(policy.modeOf('GB')).toBe('open');
  });

  it('lets a later entry override an earlier one', () => {
    const policy = policyOf('EU=nuanced,DE=blocked');
    expect(policy.modeOf('DE')).toBe('blocked');
    expect(policy.modeOf('FR')).toBe('nuanced');
    expect(policyOf('DE=blocked,EU=nuanced').modeOf('DE')).toBe('nuanced');
  });

  it('lets a country opt out of the EU selector', () => {
    const policy = policyOf('EU=blocked,IE=open');
    expect(policy.modeOf('IE')).toBe('open');
    expect(policy.modeOf('DE')).toBe('blocked');
    expect(policy.regions.has('IE')).toBe(false);
  });

  it('treats unspecified countries, nobody and blanks as open', () => {
    const policy = policyOf(LAUNCH);
    expect(policy.modeOf(null)).toBe('open');
    expect(policy.modeOf(undefined)).toBe('open');
    expect(policy.modeOf('')).toBe('open');
    expect(policy.modeOf('  ')).toBe('open');
  });

  it('reads countries in any case and the UK alias as GB', () => {
    const policy = policyOf('GB=blocked,de=blocked');
    expect(policy.modeOf('gb')).toBe('blocked');
    expect(policy.modeOf('UK')).toBe('blocked');
    expect(policy.modeOf('uk')).toBe('blocked');
    expect(policy.modeOf('de')).toBe('blocked');
    expect(policy.modeOf('FR')).toBe('open');
  });

  it('makes none, and an empty list, a policy where nothing is held', () => {
    for (const none of [policyOf('none'), createRegionPolicy([]), OPEN_REGION_POLICY]) {
      expect(none).toMatchObject({ holdsPaidUnlocks: false, unknownMode: 'open' });
      expect(none.modeOf('DE')).toBe('open');
    }
  });

  describe('the UNKNOWN default', () => {
    it('is the strictest mode in force', () => {
      expect(policyOf(LAUNCH).unknownMode).toBe('blocked');
      expect(policyOf('EU=nuanced,GB=nuanced').unknownMode).toBe('nuanced');
      expect(policyOf('EU=nuanced,US=blocked').unknownMode).toBe('blocked');
      expect(policyOf('EU=open').unknownMode).toBe('open');
      expect(policyOf('none').unknownMode).toBe('open');
    });

    it('can be set to any mode', () => {
      expect(policyOf('US=blocked,UNKNOWN=open').unknownMode).toBe('open');
      expect(policyOf('EU=nuanced,UNKNOWN=blocked').unknownMode).toBe('blocked');
      expect(policyOf('US=blocked,UNKNOWN=nuanced').unknownMode).toBe('nuanced');
    });

    it('does not make a lone UNKNOWN entry a region, but does hold unknown viewers', () => {
      const policy = policyOf('UNKNOWN=blocked');
      expect(policy.regions.size).toBe(0);
      expect(policy.holdsPaidUnlocks).toBe(true);
    });
  });

  it('holds paid unlocks in nuanced regions as well as blocked ones, as the Lock Server does', () => {
    expect(policyOf('EU=nuanced').holdsPaidUnlocks).toBe(true);
    expect(policyOf('US=blocked,UNKNOWN=open').holdsPaidUnlocks).toBe(true);
    expect(policyOf('EU=open,UNKNOWN=open').holdsPaidUnlocks).toBe(false);
  });
});
