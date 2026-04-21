import * as Templates from '@/templates';

/**
 * Default page for /profile/[pubky]/ route
 *
 * Mobile (< lg / 1024px): shows Profile (bio/details/follow) so users can easily follow.
 * Desktop (>= lg): shows Posts since the sidebar already provides follow affordances.
 *
 * Both subtrees render server-side; CSS hides the inactive one. This keeps the
 * server response identical for every visitor and avoids the hydration
 * mismatch / first-paint flash that a JS-driven viewport check would introduce.
 */
export default function DynamicProfilePage() {
  return (
    <>
      <div className="lg:hidden">
        <Templates.ProfilePageProfile />
      </div>
      <div className="hidden lg:block">
        <Templates.ProfilePagePosts />
      </div>
    </>
  );
}
