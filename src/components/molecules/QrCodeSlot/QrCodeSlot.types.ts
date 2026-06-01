export interface QrCodeSlotProps {
  isLoading: boolean;
  isExpired: boolean;
  url: string;
  generatingLabel: string;
  clickToReloadLabel: string;
  /**
   * When the active QR is itself clickable (e.g. SignIn copy-to-clipboard),
   * the consumer wraps this slot in a `group`-classed button. Setting this to
   * true adds hover/active opacity transitions to the QR and ring overlay so
   * they react to the parent group.
   */
  activeQrHasHoverEffect?: boolean;
  /**
   * When provided, the expired state renders its own inline `<button>` with
   * the given handler and label (used by Scan, whose wrapper is a `<div>`).
   * When omitted, the expired state renders only the blurred QR + reload
   * label (used by SignIn, whose wrapper `<button>` already handles the click).
   */
  expiredReloadAction?: {
    onClick: () => void;
    ariaLabel: string;
  };
}
