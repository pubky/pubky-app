export interface HotActiveUsersProps {
  /** Maximum number of users to display */
  limit?: number;
  /** Additional class name */
  className?: string;
  /**
   * Visually hide the "Active users" heading below the `lg` breakpoint (it stays in the accessibility tree).
   * Only for callers whose mobile chrome already names the section (the Hot page tab menu);
   * standalone callers such as the profile-not-found view keep the heading visible on every viewport.
   */
  hideHeadingOnMobile?: boolean;
}
