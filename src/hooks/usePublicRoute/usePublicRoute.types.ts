export interface UsePublicRouteResult {
  /**
   * Legacy alias for {@link isDynamicPublicRoute}.
   * Does **not** include core explore routes (`/home`, `/hot`, `/search`).
   */
  isPublicRoute: boolean;
  /**
   * Whether the current route is a core explore route.
   * True for /home, /hot, and /search.
   */
  isCoreExploreRoute: boolean;
  /**
   * Whether the current route is a dynamic public route.
   * True for routes like /post/[userId]/[postId] and /profile/[pubky].
   */
  isDynamicPublicRoute: boolean;
  /**
   * Whether the current route is either a core explore route or a dynamic public route.
   */
  isPublicExploreRoute: boolean;
}
