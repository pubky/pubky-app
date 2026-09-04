export interface UseSignOutResult {
  handleSignOut: () => Promise<void>;
  isLoading: boolean;
}
