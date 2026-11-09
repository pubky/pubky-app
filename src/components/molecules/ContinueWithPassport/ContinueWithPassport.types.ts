export interface ContinueWithPassportProps {
  /** Starts a Passport attempt. Must run synchronously from the click so the popup is not blocked. */
  onContinue: () => void;
  /** True while an attempt is in flight (authorization or session initialization). */
  isPending: boolean;
  /** Presentation only; both layouts open the same Passport flow. */
  variant?: 'google' | 'providers';
  className?: string;
}
