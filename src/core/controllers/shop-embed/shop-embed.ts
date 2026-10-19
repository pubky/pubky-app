import { ShopEmbedApplication } from '@/application/shop-embed/shop-embed';

export class ShopEmbedController {
  private constructor() {}

  static fetchAvailability(signal: AbortSignal): Promise<boolean> {
    return ShopEmbedApplication.fetchAvailability(signal);
  }
}
