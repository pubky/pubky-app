export interface UseAuthUrlOptions {
  /**
   * Whether to automatically fetch the auth URL on mount.
   * @default true
   */
  autoFetch?: boolean;
  /**
   * The type of auth URL to generate.
   * @default 'signin'
   */
  type?: 'signin' | 'signup';
  /**
   * The invite code for signup. Required when type is 'signup'.
   */
  inviteCode?: string;
}

export interface UseAuthUrlReturn {
  /** The authorization URL for QR code or deeplink */
  url: string;
  /** Whether the auth URL is currently being generated */
  isLoading: boolean;
  /** Whether the relay connection has expired (polls exhausted or rejected) */
  isExpired: boolean;
  /** Manually trigger auth URL generation */
  fetchUrl: () => Promise<void>;
}
