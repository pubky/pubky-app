/** Discriminated union: inviteCode is required when type is 'signup' so TypeScript catches missing invite at compile time. */
export type UseAuthUrlOptions =
  | {
      /** Whether to automatically fetch the auth URL on mount. @default true */
      autoFetch?: boolean;
      /** The type of auth URL to generate. @default 'signin' */
      type?: 'signin';
    }
  | {
      /** Whether to automatically fetch the auth URL on mount. @default true */
      autoFetch?: boolean;
      /** Signup flow requires invite code */
      type: 'signup';
      /** The invite code for signup. Required when type is 'signup'. */
      inviteCode: string;
    }
  | {
      /** Whether to automatically fetch the auth URL on mount. @default true */
      autoFetch?: boolean;
      /**
       * Same URL as `signin`, but approval swaps the stored session for the new one instead of
       * running the sign-in routine (#2373).
       */
      type: 'upgrade';
    };

export interface UseAuthUrlReturn {
  /** The authorization URL for QR code or deeplink */
  url: string;
  /** Whether the auth URL is currently being generated */
  isLoading: boolean;
  /** Whether the relay connection has expired (polls exhausted or rejected) */
  isExpired: boolean;
  /** Manually trigger auth URL generation */
  fetchUrl: () => Promise<void>;
  /** Copy the auth URL to clipboard */
  copyAuthUrl: () => Promise<void>;
}
