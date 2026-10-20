import { ShopMetadataApplication } from '@/application/shop-metadata/shop-metadata';
import type { TShopMetadata } from '@/application/shop-metadata/shop-metadata.types';
import { shopListingMetadataRoute } from '@/pipes/shop-metadata/shop-metadata';

export class ShopMetadataController {
  private constructor() {}

  static fetch(path: readonly string[] | undefined): Promise<TShopMetadata> {
    return ShopMetadataApplication.fetch(shopListingMetadataRoute(path));
  }
}
