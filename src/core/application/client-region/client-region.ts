import { ClientRegionService } from '@/services/client-region/client-region';
import type { TClientCountryResult } from '@/services/client-region/client-region.types';

export class ClientRegionApplication {
  private constructor() {}

  /** The viewer's IP country, or `unavailable` when the Shop's region route could not answer. */
  static fetchCountry(): Promise<TClientCountryResult> {
    return ClientRegionService.fetchCountry();
  }
}
