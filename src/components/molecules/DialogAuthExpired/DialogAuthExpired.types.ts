export interface DialogAuthExpiredProps {
  open: boolean;
  onRefresh: () => void;
  /** When true, disables the Refresh button to prevent multiple concurrent fetches */
  isLoading?: boolean;
}
