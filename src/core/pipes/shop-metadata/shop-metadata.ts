import type { TShopListingMetadataRoute } from '@/application/shop-metadata/shop-metadata.types';
import { shopFramePath } from '@/libs/shop-embed/bridge';
import { isPubkyIdentifier } from '@/libs/utils/utils';

/** Only public listing documents may be fetched for the outer Shop preview. */
export function shopListingMetadataRoute(path: readonly string[] | undefined): TShopListingMetadataRoute | null {
  if (
    !path ||
    path.length !== 4 ||
    path[0] !== 'marketplace' ||
    path[1] !== 'listing' ||
    !isPubkyIdentifier(path[2]) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(path[3])
  ) {
    return null;
  }

  const hostPath = `/shop/${path.join('/')}`;
  const embedPath = shopFramePath(hostPath);
  return embedPath ? { hostPath, embedPath } : null;
}
