export interface UseMobileAuthReturn {
  /** The authorization URL for QR code or deeplink */
  url: string;
  /** Whether the auth URL is currently being generated */
  isLoading: boolean;
  /** Manually trigger auth URL generation */
  fetchUrl: () => Promise<void>;
  /** Whether the device is iOS (iPhone, iPad, iPod) */
  isIOS: boolean;
  /** Whether the app handoff is in progress after tapping authorize */
  isOpeningRing: boolean;
  /** Handler for mobile authorize - navigates to deeplink with platform-specific store fallback */
  onAuthorizeClick: () => void;
}
