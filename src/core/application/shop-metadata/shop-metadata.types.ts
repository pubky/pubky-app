export interface TShopListingMetadataRoute {
  hostPath: string;
  embedPath: string;
}

export interface TShopListingMetadata {
  title: string;
  description: string;
  image: string | null;
}

export interface TShopMetadata extends Omit<TShopListingMetadata, 'image'> {
  image: string;
  url: string;
}
