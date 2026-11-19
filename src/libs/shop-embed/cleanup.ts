/** A completed Shop teardown leaves the epoch on the App record; Shop acknowledges it separately. */
export const SHOP_CLEANUP_ACK_KEY = 'shop-host-cleanup-epoch-v1';
export const SHOP_TEARDOWN_PENDING_KEY = 'pubky-messaging-keys-teardown-pending';

export function needsShopCleanup(storage: Storage, epoch?: string): boolean {
  return Boolean(
    epoch && (storage.getItem(SHOP_CLEANUP_ACK_KEY) !== epoch || storage.getItem(SHOP_TEARDOWN_PENDING_KEY)),
  );
}
