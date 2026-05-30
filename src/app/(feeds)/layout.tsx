'use client';
import { Fragment, useState } from 'react';
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
 * mounted during the modal, we cache the last successful config in a state
 * and reuse it when the resolver returns `null`.
 *
 * If the layout mounts directly into the intercepted state — e.g. user is on
 * `/home`, opens a post modal (`/post/...`), navigates to `/settings`
 * (unmounting `FeedsLayout` and dropping the cache), then hits browser-back
 * — the cache is empty and `shellConfig` is `null`. In that case we render
 * `<ContentLayout>` with no shell props (all are optional); the modal covers
 * the empty chrome until it's dismissed, at which point a soft-nav resolves
 * and repopulates the config. Any momentary flash of empty chrome on close
 * is an acceptable tradeoff vs. extra complexity.
 *
 * ## No throw for missing configs
 *
 * If a new route is added under `(feeds)/` without a matching entry in
 * `_shell/configs.tsx`, the layout simply renders empty chrome rather than
 * throwing — an uncaught error in a layout would crash the whole feeds
 * cluster for end users, which is a much worse outcome than missing
 * sidebars for a dev who forgot to wire up a config. Keep `configs` in
 * sync with the routes under `(feeds)/` by convention.
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
  // Fallback chain:
  //   1. Fresh resolve from pathname (normal feeds navigation).
  //   2. Cached previous config while the intercepted `(.)post` modal is
  //      active (intra-cluster: feed → post modal keeps chrome behind it).
  //   3. `null` — layout mounted directly into the modal with no cache (see
  //      header comment). `<ContentLayout>` accepts all shell slots as
  //      optional, so spreading `undefined`s is safe.
  const shellConfig = resolved ?? (isPostActive ? lastFeedsConfig : null);

  return (
    <>
      {/* Hide feed content but keep mounted to preserve scroll position. */}
      <Container overrideDefaults className={isPostActive ? 'hidden' : 'contents'}>
        <ContentLayout {...shellConfig}>{children}</ContentLayout>
      </Container>

      <Fragment key="post">
        {/* Parallel route @post — renders intercepted post page when active. */}
        {post}
      </Fragment>
    </>
  );
}
