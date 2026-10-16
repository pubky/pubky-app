import { ShopMetadataService } from '@/services/nextjs/shop-metadata/shop-metadata';
import type { TShopListingMetadataRoute, TShopMetadata } from './shop-metadata.types';

export class ShopMetadataApplication {
  private constructor() {}

  static async fetch(route: TShopListingMetadataRoute | null): Promise<TShopMetadata> {
    const listing = route ? await ShopMetadataService.fetch(route) : null;
    return {
      title: listing?.title ?? 'Pubky Marketplace',
      description: listing?.description ?? 'Buy and sell on Pubky Marketplace.',
      image: listing?.image ?? '/shop-embed/marketplace/opengraph-image',
      url: route?.hostPath ?? '/shop',
    };
  }
}
