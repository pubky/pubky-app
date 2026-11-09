import { beforeEach, describe, expect, it } from 'vitest';
import { useClientRegionStore } from './clientRegion.store';
import { clientRegionInitialState } from './clientRegion.types';

describe('useClientRegionStore', () => {
  beforeEach(() => {
    useClientRegionStore.setState(clientRegionInitialState);
  });

  it('starts idle with no country', () => {
    expect(useClientRegionStore.getState()).toMatchObject({ status: 'idle', country: null });
  });

  it('moves loading, then ready with the country', () => {
    useClientRegionStore.getState().markLoading();
    expect(useClientRegionStore.getState().status).toBe('loading');

    useClientRegionStore.getState().markReady('DE');
    expect(useClientRegionStore.getState()).toMatchObject({ status: 'ready', country: 'DE' });
  });

  it('is ready with a null country when the edge could not tell', () => {
    useClientRegionStore.getState().markReady(null);
    expect(useClientRegionStore.getState()).toMatchObject({ status: 'ready', country: null });
  });

  it('drops the country on failure', () => {
    useClientRegionStore.getState().markReady('DE');
    useClientRegionStore.getState().markFailed();
    expect(useClientRegionStore.getState()).toMatchObject({ status: 'failed', country: null });
  });
});
