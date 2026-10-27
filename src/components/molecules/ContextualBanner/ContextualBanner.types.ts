export interface ContextualBannerProps {
  /** One line; truncated with an ellipsis when it does not fit. */
  headline: string;
  /** Up to two lines. */
  body: string;
  /** Destination of "Join Pubky" (the first sign-up step). */
  joinHref: string;
  /** Destination of "Sign in". */
  signInHref: string;
  /** Starts "Continue with Google". The button and its divider render only when provided. */
  onContinueWithGoogle?: () => void;
  /** True while a "Continue with Google" attempt is running. */
  isGooglePending?: boolean;
  className?: string;
}
