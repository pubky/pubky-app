export interface UseDeleteAccountResult {
  handleDeleteAccount: () => Promise<void>;
  isDeleting: boolean;
  progress: number;
}
