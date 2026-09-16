export interface OnboardingLayoutProps {
  /**
   * Unique identifier for the content container
   */
  testId: string;
  /**
   * Main content to be displayed
   */
  children: React.ReactNode;
  /**
   * Optional navigation component to be displayed at the bottom
   */
  navigation?: React.ReactNode;
  /**
   * Pins navigation to the bottom of the available mobile viewport.
   * Disable when navigation should keep a fixed distance from the content.
   */
  pinNavigationToBottom?: boolean;
  /**
   * Overrides for the root container, merged last. Lets non-onboarding
   * consumers (e.g. /settings/edit) align the gutter with their own shell
   * without changing the onboarding flows.
   */
  className?: string;
}
