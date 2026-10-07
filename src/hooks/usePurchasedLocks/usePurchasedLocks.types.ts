export interface UsePurchasedLocksParams {
  /** False skips the listing until a supported payment lock is available. */
  enabled: boolean;
}

export interface UsePurchasedLocksResult {
  /** True when this lock already has a bundle id saved on the reader's homeserver. */
  hasPurchase: (lockId: string | null) => boolean;
  /** Records a purchase made in this session, so cards see it without a fresh listing. */
  markPurchased: (lockId: string) => void;
}
