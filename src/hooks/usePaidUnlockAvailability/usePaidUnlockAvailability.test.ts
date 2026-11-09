import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientRegionController } from '@/controllers/client-region/client-region';
import { createRegionPolicy, OPEN_REGION_POLICY, parseRegionModes, type RegionPolicy } from '@/libs/region/regionModes';
import { useClientRegionStore } from '@/stores/clientRegion/clientRegion.store';
import { clientRegionInitialState } from '@/stores/clientRegion/clientRegion.types';
import { usePaidUnlockAvailability } from './usePaidUnlockAvailability';

const mocks = vi.hoisted(() => ({ policy: undefined as RegionPolicy | undefined }));

vi.mock('@/config/region', () => ({ getRegionPolicy: () => mocks.policy }));
vi.mock('@/controllers/client-region/client-region', () => ({
  ClientRegionController: { fetchCountryOnce: vi.fn(async () => {}) },
}));

function policyOf(raw: string): RegionPolicy {
  const parsed = parseRegionModes(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return createRegionPolicy(parsed.entries);
}

describe('usePaidUnlockAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClientRegionStore.setState(clientRegionInitialState);
    mocks.policy = policyOf('EU=blocked,GB=blocked,US=blocked');
  });

  it('asks the region once the deployment lists a region, and says it is checking until it knows', () => {
    const { result } = renderHook(() => usePaidUnlockAvailability());

    expect(ClientRegionController.fetchCountryOnce).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ status: 'checking' });
  });

  it('is blocked for a viewer in a listed region once the country arrives', () => {
    const { result } = renderHook(() => usePaidUnlockAvailability());

    act(() => useClientRegionStore.getState().markReady('DE'));

    expect(result.current).toEqual({ status: 'blocked', cause: 'region' });
  });

  it('is available for a viewer anywhere else', () => {
    const { result } = renderHook(() => usePaidUnlockAvailability());

    act(() => useClientRegionStore.getState().markReady('CH'));

    expect(result.current).toEqual({ status: 'available' });
  });

  it('is blocked as unknown when the edge could not tell the country and unknown viewers are held', () => {
    const { result } = renderHook(() => usePaidUnlockAvailability());

    act(() => useClientRegionStore.getState().markReady(null));

    expect(result.current).toEqual({ status: 'blocked', cause: 'unknown' });
  });

  it('is available when the region could not be read, leaving the Lock Server to decide', () => {
    const { result } = renderHook(() => usePaidUnlockAvailability());

    act(() => useClientRegionStore.getState().markFailed());

    expect(result.current).toEqual({ status: 'available' });
  });

  it('shares one answer across every lock card on the page', () => {
    useClientRegionStore.setState({ status: 'ready', country: 'US' });

    const first = renderHook(() => usePaidUnlockAvailability());
    const second = renderHook(() => usePaidUnlockAvailability());

    expect(first.result.current).toEqual({ status: 'blocked', cause: 'region' });
    expect(second.result.current).toEqual(first.result.current);
  });

  // Free content and every other feature must not read the viewer's region at all.
  it('makes no request and is available while the deployment lists no region', () => {
    mocks.policy = OPEN_REGION_POLICY;
    useClientRegionStore.setState({ status: 'ready', country: 'US' });

    const { result } = renderHook(() => usePaidUnlockAvailability());

    expect(ClientRegionController.fetchCountryOnce).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'available' });
  });
});
