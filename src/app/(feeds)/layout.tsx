'use client';
import { useState } from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { Container } from '@/atoms/Container/Container';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { type FeedsShellConfig, tryResolveFeedsShellConfig } from './_shell/configs';

/**
 * Shared shell for the feed cluster (`/home`, `/feed/[id]`, `/bookmarks`, `/search`).
 *
 * Renders a single persistent `<ContentLayout>` across intra-cluster navigation
 * so `MobileHeader`, sticky sidebars and drawer state do not unmount on every
 * route change. Per-route shell props are resolved from the pathname via
 * `tryResolveFeedsShellConfig` (see `./_shell/configs.tsx`).
 *
 * The hoisted `@post` parallel slot renders the intercepted post modal as a
 * sibling of `<ContentLayout>` (full-width, not nested inside the main column).
 * When the intercepted route is active, the feed children stay mounted but are
 * hidden via `class="hidden"` so scroll position is preserved on back-nav.
 *
 * ## Intercepted-modal pathname handling
 *
 * While the `(.)post` slot is active, `usePathname()` reports the post URL
 * (`/post/<user>/<post>`), not the underlying feed URL. That pathname does
 * **not** resolve to a feeds shell config. To keep the previous route's chrome
 * mounted (and avoid throwing during the modal), we cache the last successful
 * config in a state and reuse it when the resolver returns `null`.
 *
 * ## Known dev-only warning
 *
 * In dev mode you may see:
 *   `Each child in a list should have a unique "key" prop. Check the render
 *   method of \`ClientSegmentRoot\`.`
 *
 * The trace originates inside `react-server-dom-turbopack` while reconciling
 * the RSC stream chunks for this layout's parallel slots — i.e. it fires
 * *before* `FeedsLayout` runs. It is a Next.js framework warning (same family
 * as vercel/next.js#70452 and the parallel-route + route-group cluster) and
 * has no functional impact: routing, hydration, scroll preservation and
 * production builds are unaffected. We cannot silence it from userland.
 */
export default function FeedsLayout({ children, post }: { children: React.ReactNode; post: React.ReactNode }) {
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments('post');
  // Post is active only when the intercepted route (.)post is in segments.
  // Marker is `(.)post` (single-dot) because the `(feeds)` group adds no URL
  // segment, so `@post` sits at the same segment level as `/post`.
  const isPostActive = segments.includes('(.)post');

  // Derived-state-during-render pattern: when the resolver returns a fresh
  // feeds config we store it; when it returns null AND the intercepted
  // `(.)post` modal is active (`pathname` is `/post/...`), we reuse the last
  // stored config so the previous route's chrome stays mounted under the
  // modal. React docs:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  //
  // `setLastFeedsConfig` during render triggers a synchronous re-render —
  // safe here because configs are module-level constants (stable identity),
  // so the `!==` guard eliminates the update on subsequent renders.
  const [lastFeedsConfig, setLastFeedsConfig] = useState<FeedsShellConfig | null>(null);
  const resolved = tryResolveFeedsShellConfig(pathname);
  if (resolved && resolved !== lastFeedsConfig) {
    setLastFeedsConfig(resolved);
  }
  // Fallback is intentionally gated on `isPostActive` so a non-modal unknown
  // pathname (e.g. a new `(feeds)/notifications/page.tsx` added without a
  // matching entry in `configs`) hits the throw below instead of silently
  // rendering stale chrome from the previous feed route.
  const shellConfig = resolved ?? (isPostActive ? lastFeedsConfig : null);

  if (!shellConfig) {
    // Config-drift safety net: reachable only when a new route is added under
    // `(feeds)/` without a matching entry in `configs` in `_shell/configs.tsx`.
    //
    // The other apparent paths to here are unreachable by design:
    //   - A direct deep-link to `/post/...` does NOT mount this layout —
    //     `/post/` is outside the `(feeds)` route group, so the standalone
    //     `app/post/[userId]/[postId]/page.tsx` handles it.
    //   - Soft-nav to `/post/...` from a feed route activates the intercepted
    //     `(.)post` slot, by which point `lastFeedsConfig` is always populated
    //     (the user had to be on a feed route to reach the modal).
    throw new Error(
      `[FeedsLayout] No feeds shell config for pathname "${pathname}". ` +
        `Add an entry to (feeds)/_shell/configs.tsx if this is a new feeds route.`,
    );
  }

  return (
    <>
      {/* Hide feed content but keep mounted to preserve scroll position. */}
      <Container overrideDefaults className={isPostActive ? 'hidden' : 'contents'}>
        <ContentLayout {...shellConfig}>{children}</ContentLayout>
      </Container>

      {/* Parallel route @post — renders intercepted post page when active. */}
      {post}
    </>
  );
}
