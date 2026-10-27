import { ShopEmbedService } from '@/services/shop-embed/shop-embed';

export class ShopEmbedApplication {
  private constructor() {}

  static fetchAvailability(signal: AbortSignal): Promise<boolean> {
    return ShopEmbedService.fetchAvailability(signal);
  }
}
