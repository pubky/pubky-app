/** Brand mark drawn over the centre of the active QR. */
export interface QrCodeSlotLogo {
  src: string;
  alt: string;
}

export interface QrCodeSlotProps {
  isLoading: boolean;
  isExpired: boolean;
  url: string;
  generatingLabel: string;
  clickToReloadLabel: string;
  /** QR code pixel size. Defaults to 176. */
  size?: number;
  /**
   * When the active QR is itself clickable (e.g. `AuthQrCopyButton`),
   * the consumer wraps this slot in a `group`-classed button. Setting this to
   * true adds hover/active opacity transitions to the QR and ring overlay so
   * they react to the parent group.
   */
  activeQrHasHoverEffect?: boolean;
  /** Centre mark of the active QR. Defaults to the Pubky Ring mark. */
  logo?: QrCodeSlotLogo;
}
