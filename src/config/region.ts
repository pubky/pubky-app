import { createRegionPolicy, OPEN_REGION_POLICY, parseRegionModes, type RegionPolicy } from '@/libs/region/regionModes';
import { getRegionModes } from '@/libs/runtime-config/runtime-config';

let memoized: { raw: string; policy: RegionPolicy } | null = null;

/**
 * The regions where paid unlocks are held (`PUBKY_RUNTIME_REGION_MODES`). Unset means nothing is held. The
 * runtime-config schema rejects a malformed list at startup, so the open fallback only guards a state that
 * cannot be reached.
 */
export function getRegionPolicy(): RegionPolicy {
  const raw = getRegionModes();
  if (raw === undefined) return OPEN_REGION_POLICY;
  if (memoized?.raw !== raw) {
    const parsed = parseRegionModes(raw);
    memoized = { raw, policy: parsed.ok ? createRegionPolicy(parsed.entries) : OPEN_REGION_POLICY };
  }
  return memoized.policy;
}
