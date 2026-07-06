/**
 * Thin re-export: the follow button was promoted to the shared FollowButton
 * molecule (used beyond the popover, e.g. the graph node panel); this alias
 * keeps existing popover imports stable.
 */
export { FollowButton as UserInfoPopoverFollowButton } from '@/molecules/FollowButton/FollowButton';
