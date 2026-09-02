/**
 * Shared Tailwind class strings for app-shell spacing.
 *
 * The shell gutter, its full-bleed cancellation, and the main content stack
 * are one design decision spread across several components. These constants
 * keep the literals in lockstep so a spacing retune cannot silently miss a
 * surface (see `GRID_FEED_GAP_CLASS` in `@/config/feed` for the precedent).
 */

/**
 * Horizontal app-shell gutter: 16px on mobile, 24px from `lg`, none at `xl`
 * (the `xl` shell centers content via `--container-max-width` instead).
 * Shared by ContentLayout, ProfilePageLayoutWrapper, and MobileHeader so
 * header chrome and page content keep one content edge.
 *
 * Overriding: the gutter spans three breakpoint groups, so tailwind-merge
 * resolves caller overrides per group — a bare `px-0` only replaces the
 * sub-`lg` value; override each group you target (e.g. `px-0 lg:px-0`).
 */
export const CONTENT_GUTTER_CLASS = 'px-4 lg:px-6 xl:px-0';

/**
 * Cancels `CONTENT_GUTTER_CLASS` below `lg` so mobile-only chrome (tab bars,
 * feed navigation) can run edge-to-edge inside the padded shell.
 */
export const FULL_BLEED_GUTTER_CLASS = '-mx-4 lg:mx-0';

/**
 * Main content column stack. Shared by ContentLayout's content area and
 * TimelineFeedContent's pull-to-refresh scope so children keep the same
 * flex-col spacing whether or not a page wraps them in TimelineFeedWithStream.
 */
export const CONTENT_AREA_STACK_CLASS = 'min-w-0 flex-1 gap-4 lg:overflow-hidden';
