import { ClientRegionApplication } from '@/application/client-region/client-region';
import { useClientRegionStore } from '@/stores/clientRegion/clientRegion.store';

export class ClientRegionController {
  private constructor() {}

  /**
   * Reads the viewer's IP country once per page load, however many lock cards ask. A failed read is final for
   * the load: a deployment without a Shop route would otherwise be asked again by every card in the feed.
   */
  static async fetchCountryOnce(): Promise<void> {
    const store = useClientRegionStore.getState();
    if (store.status !== 'idle') return;
    store.markLoading();
    const result = await ClientRegionApplication.fetchCountry();
    if (result.status === 'ready') store.markReady(result.country);
    else store.markFailed();
  }
}
