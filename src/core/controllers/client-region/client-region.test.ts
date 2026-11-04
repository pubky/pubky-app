import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientRegionApplication } from '@/application/client-region/client-region';
import { useClientRegionStore } from '@/stores/clientRegion/clientRegion.store';
import { clientRegionInitialState } from '@/stores/clientRegion/clientRegion.types';
import { ClientRegionController } from './client-region';

vi.mock('@/application/client-region/client-region', () => ({
  ClientRegionApplication: { fetchCountry: vi.fn() },
}));

describe('ClientRegionController.fetchCountryOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClientRegionStore.setState(clientRegionInitialState);
  });

  it('stores the country the route reports', async () => {
    vi.mocked(ClientRegionApplication.fetchCountry).mockResolvedValue({ status: 'ready', country: 'US' });

    await ClientRegionController.fetchCountryOnce();

    expect(useClientRegionStore.getState()).toMatchObject({ status: 'ready', country: 'US' });
  });

  it('stores a null country when the edge could not tell', async () => {
    vi.mocked(ClientRegionApplication.fetchCountry).mockResolvedValue({ status: 'ready', country: null });

    await ClientRegionController.fetchCountryOnce();

    expect(useClientRegionStore.getState()).toMatchObject({ status: 'ready', country: null });
  });

  it('marks the read failed when the route is unavailable', async () => {
    vi.mocked(ClientRegionApplication.fetchCountry).mockResolvedValue({ status: 'unavailable' });

    await ClientRegionController.fetchCountryOnce();

    expect(useClientRegionStore.getState().status).toBe('failed');
  });

  it('reads once however many lock cards ask at the same time', async () => {
    let answer!: (value: { status: 'ready'; country: string }) => void;
    vi.mocked(ClientRegionApplication.fetchCountry).mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );

    const first = ClientRegionController.fetchCountryOnce();
    const second = ClientRegionController.fetchCountryOnce();
    expect(useClientRegionStore.getState().status).toBe('loading');
    answer({ status: 'ready', country: 'DE' });
    await Promise.all([first, second]);

    expect(ClientRegionApplication.fetchCountry).toHaveBeenCalledTimes(1);
  });

  it('does not ask again after the answer, nor after a failure, until the page reloads', async () => {
    vi.mocked(ClientRegionApplication.fetchCountry).mockResolvedValue({ status: 'unavailable' });

    await ClientRegionController.fetchCountryOnce();
    await ClientRegionController.fetchCountryOnce();
    useClientRegionStore.getState().markReady('DE');
    await ClientRegionController.fetchCountryOnce();

    expect(ClientRegionApplication.fetchCountry).toHaveBeenCalledTimes(1);
  });
});
