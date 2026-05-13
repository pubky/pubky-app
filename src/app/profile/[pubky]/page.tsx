import { ProfilePostsPage } from '@/templates/Profile/Posts/ProfilePostsPage';

/**
 * Default page for /profile/[pubky]/ route
 *
 * Canonical posts view for other users on every viewport.
 * Mobile-only profile summary is injected by ProfilePageLayout using the
 * already-loaded profile header data.
 */
export default function DynamicProfilePage() {
  return <ProfilePostsPage />;
}
