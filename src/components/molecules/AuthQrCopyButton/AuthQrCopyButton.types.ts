import type { QrCodeSlotLogo } from '@/molecules/QrCodeSlot/QrCodeSlot.types';

export interface AuthQrCopyButtonProps {
  url: string;
  isLoading: boolean;
  isExpired: boolean;
  /** Copies `url` to the clipboard; a rejection shows the copy-failed toast. */
  onCopy: () => Promise<void>;
  /** Regenerates an expired auth URL. */
  onReload: () => void;
  /** Accessible name of the expired QR, e.g. 'Reload sign-in QR code'. */
  reloadAriaLabel: string;
  /** Extra lock on top of the loading and missing-URL states. */
  disabled?: boolean;
  /** Centre mark of the QR, e.g. Bitkit's when the sign-up QR is meant for Bitkit. Defaults to Pubky Ring. */
  logo?: QrCodeSlotLogo;
}
