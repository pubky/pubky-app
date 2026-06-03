import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORCE_FEED_SCROLL_TOP_KEY } from '@/config/feed';
import { tryResolveFeedsShellConfig } from './_shell/configs';
import FeedsLayout from './layout';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useSelectedLayoutSegments: vi.fn(),
}));

vi.mock('./_shell/configs', () => ({
  tryResolveFeedsShellConfig: vi.fn(),
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" data-override-defaults={overrideDefaults ? 'true' : 'false'} className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    feedVariant,
    leftSidebarContent,
    rightSidebarContent,
    rightDrawerContentMobile,
    showRightMobileButton,
  }: {
    children: React.ReactNode;
    feedVariant?: string;
    leftSidebarContent?: React.ReactNode;
    rightSidebarContent?: React.ReactNode;
    rightDrawerContentMobile?: React.ReactNode;
    showRightMobileButton?: boolean;
  }) => (
    <div
      data-testid="content-layout"
      data-feed-variant={feedVariant ?? ''}
      data-show-right-mobile-button={showRightMobileButton === false ? 'false' : 'true'}
      data-has-right-drawer-mobile={rightDrawerContentMobile ? 'true' : 'false'}
    >
      <div data-testid="left-sidebar">{leftSidebarContent}</div>
      <div data-testid="right-sidebar">{rightSidebarContent}</div>
      <div data-testid="right-drawer-mobile">{rightDrawerContentMobile}</div>
      <div data-testid="children">{children}</div>
    </div>
  ),
}));

const SHELL_CONFIG = {
  feedVariant: 'home' as const,
  leftSidebarContent: <div data-testid="config-left">left</div>,
  rightSidebarContent: <div data-testid="config-right">right</div>,
  rightDrawerContentMobile: <div data-testid="config-right-mobile">right-mobile</div>,
};

describe('FeedsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/home');
    vi.mocked(useSelectedLayoutSegments).mockReturnValue([]);
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(SHELL_CONFIG);
  });

  it('passes the resolved shell config to ContentLayout', () => {
    render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );

    expect(tryResolveFeedsShellConfig).toHaveBeenCalledWith('/home');
    const layout = screen.getByTestId('content-layout');
    expect(layout).toHaveAttribute('data-feed-variant', 'home');
    expect(screen.getByTestId('config-left')).toBeInTheDocument();
    expect(screen.getByTestId('config-right')).toBeInTheDocument();
    expect(screen.getByTestId('config-right-mobile')).toBeInTheDocument();
  });

  it('renders children inside ContentLayout when post slot is not active', () => {
    render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );

    expect(screen.getByTestId('feed-content')).toBeInTheDocument();
    expect(screen.getByTestId('children')).toContainElement(screen.getByTestId('feed-content'));
    expect(screen.getAllByTestId('container')[0]).toHaveClass('contents');
  });

  it('renders the parallel post slot regardless of activity', () => {
    render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );

    expect(screen.getByTestId('post')).toBeInTheDocument();
  });

  it('hides children but keeps them mounted when intercepted (.)post route is active', () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(['(.)post']);

    render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );

    expect(screen.getByTestId('feed-content')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('hidden');
  });

  it('resolves the shell config from the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/feed/abc123');

    render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );

    expect(tryResolveFeedsShellConfig).toHaveBeenCalledWith('/feed/abc123');
  });

  it('falls back to the last resolved shell config when pathname is intercepted (/post/...)', () => {
    const FEED_CONFIG = {
      feedVariant: 'custom' as const,
      leftSidebarContent: <div data-testid="feed-left">feed-left</div>,
      rightSidebarContent: <div data-testid="feed-right">feed-right</div>,
      rightDrawerContentMobile: <div data-testid="feed-right-mobile">feed-right-mobile</div>,
    };

    // First render: user is on /feed/abc123 and resolver returns the feed config.
    // Note: the layout uses setState-during-render to cache the last config, so
    // the resolver may be called multiple times per render cycle — we use
    // `mockReturnValue` (not `mockReturnValueOnce`) so each call in the cycle
    // returns the same value.
    vi.mocked(usePathname).mockReturnValue('/feed/abc123');
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(FEED_CONFIG);

    const { rerender } = render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );

    expect(screen.getByTestId('feed-left')).toBeInTheDocument();

    // Now user clicks a post: pathname switches to `/post/...` and the (.)post
    // slot becomes active. Resolver returns null — layout must reuse the
    // previously-cached feed config (and NOT throw).
    vi.mocked(usePathname).mockReturnValue('/post/alice/123');
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(['(.)post']);
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(null);

    expect(() =>
      rerender(
        <FeedsLayout post={<div data-testid="post">post</div>}>
          <div data-testid="feed-content">Feed</div>
        </FeedsLayout>,
      ),
    ).not.toThrow();

    // Cached config is still rendered — feed-left from the prior render.
    expect(screen.getByTestId('feed-left')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('hidden');
  });

  it('renders empty chrome (no throw) on an unknown pathname when the (.)post slot is NOT active, even with a cached config', () => {
    // Config-drift case: someone adds `(feeds)/notifications/` without a
    // matching entry in `_shell/configs.tsx`. The layout intentionally does
    // NOT throw — crashing the whole feeds cluster for end users is far
    // worse than missing sidebars for a dev who forgot to wire up the
    // config. The cache fallback is also intentionally gated on the modal
    // being active, so we should NOT see stale `feed-left` from /home here.
    const FEED_CONFIG = {
      feedVariant: 'home' as const,
      leftSidebarContent: <div data-testid="feed-left">feed-left</div>,
      rightSidebarContent: <div data-testid="feed-right">feed-right</div>,
      rightDrawerContentMobile: <div data-testid="feed-right-mobile">feed-right-mobile</div>,
    };

    // First render on a real feeds route to populate the cache.
    vi.mocked(usePathname).mockReturnValue('/home');
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(FEED_CONFIG);

    const { rerender } = render(
      <FeedsLayout post={<div data-testid="post">post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedsLayout>,
    );
    expect(screen.getByTestId('feed-left')).toBeInTheDocument();

    // Now soft-nav to a non-feeds pathname WITHOUT activating the (.)post slot.
    vi.mocked(usePathname).mockReturnValue('/notifications');
    vi.mocked(useSelectedLayoutSegments).mockReturnValue([]);
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(null);

    expect(() =>
      rerender(
        <FeedsLayout post={<div data-testid="post">post</div>}>
          <div data-testid="feed-content">Feed</div>
        </FeedsLayout>,
      ),
    ).not.toThrow();

    // ContentLayout still mounts but with no shell props — stale cached
    // chrome must NOT leak into a non-modal route.
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-right')).not.toBeInTheDocument();
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-feed-variant', '');
    // Container is NOT hidden because the post slot is not active.
    expect(screen.getAllByTestId('container')[0]).not.toHaveClass('hidden');
  });

  it('renders empty chrome (no throw) when mounted directly into the (.)post modal with no cached config', () => {
    // Real-user flow: home → click post (intercepted modal) → click settings
    // (unmounts FeedsLayout, dropping the cache) → browser back to /post/...
    // FeedsLayout remounts fresh with the modal already active and no
    // cached config. Must not throw — the modal covers the empty chrome.
    vi.mocked(usePathname).mockReturnValue('/post/alice/123');
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(['(.)post']);
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(null);

    expect(() =>
      render(
        <FeedsLayout post={<div data-testid="post">post</div>}>
          <div data-testid="feed-content">Feed</div>
        </FeedsLayout>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-feed-variant', '');
    // Feed content is hidden while the modal is active.
    expect(screen.getAllByTestId('container')[0]).toHaveClass('hidden');
    // Post slot still renders.
    expect(screen.getByTestId('post')).toBeInTheDocument();
  });
});

describe('FeedsLayout - feed scroll restoration (#1348)', () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>;

  // Returns a fresh element each call. Reusing one element reference would make
  // React bail out of re-rendering (identical element optimization), so the
  // mocked route inputs would never take effect on rerender.
  const makeTree = () => (
    <FeedsLayout post={<div data-testid="post">post</div>}>
      <div data-testid="feed-content">Feed</div>
    </FeedsLayout>
  );

  // Drive the layout's route/post inputs.
  function goTo(
    pathname: string,
    { postActive = false, isFeed = true }: { postActive?: boolean; isFeed?: boolean } = {},
  ) {
    vi.mocked(usePathname).mockReturnValue(pathname);
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(postActive ? ['(.)post'] : []);
    vi.mocked(tryResolveFeedsShellConfig).mockReturnValue(isFeed ? SHELL_CONFIG : null);
  }

  function setScrollY(y: number) {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    setScrollY(0);
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    goTo('/home');
  });

  it('does not restore scroll on initial mount or while opening the post', () => {
    setScrollY(500);
    const { rerender } = render(makeTree());
    expect(scrollToSpy).not.toHaveBeenCalled();

    // Opening the post must not trigger a restore either.
    setScrollY(3000);
    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('restores the feed offset when the post closes back to the same feed route', () => {
    const { rerender } = render(makeTree());

    // User scrolls the feed.
    setScrollY(500);
    fireEvent.scroll(window);

    // Open a post — the window scroll is clobbered by the post view.
    setScrollY(3000);
    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());

    // Close back to /home.
    goTo('/home');
    rerender(makeTree());

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 500, behavior: 'auto' });
  });

  it('does not let scrolling while the post is active overwrite the saved feed offset', () => {
    const { rerender } = render(makeTree());
    setScrollY(500);
    fireEvent.scroll(window);

    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());

    // Scrolling within the post overlay must be ignored.
    setScrollY(3000);
    fireEvent.scroll(window);

    goTo('/home');
    rerender(makeTree());

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 500, behavior: 'auto' });
  });

  it('clears the force-home-scroll-top flag on a same-route restore', () => {
    const { rerender } = render(makeTree());
    setScrollY(500);
    fireEvent.scroll(window);

    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());

    window.sessionStorage.setItem(FORCE_FEED_SCROLL_TOP_KEY, '1');

    goTo('/home');
    rerender(makeTree());

    expect(window.sessionStorage.getItem(FORCE_FEED_SCROLL_TOP_KEY)).toBeNull();
  });

  it('does NOT restore a source feed offset onto a different feed; honors the forward-nav flag (cross-route)', () => {
    // Start on /bookmarks and scroll it.
    goTo('/bookmarks');
    const { rerender } = render(makeTree());
    setScrollY(800);
    fireEvent.scroll(window);

    // Open a post from /bookmarks.
    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());

    // Logo sets the top-scroll intent while on /post/...
    window.sessionStorage.setItem(FORCE_FEED_SCROLL_TOP_KEY, '1');

    // Close onto /home (a DIFFERENT feed than the source).
    setScrollY(0);
    goTo('/home');
    rerender(makeTree());

    // The bookmarks offset (800) must NOT be splashed onto Home. Because the
    // user explicitly navigated (flag set), Home scrolls to the top instead,
    // and the one-shot flag is consumed.
    expect(scrollToSpy).not.toHaveBeenCalledWith({ top: 800, behavior: 'auto' });
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(window.sessionStorage.getItem(FORCE_FEED_SCROLL_TOP_KEY)).toBeNull();
  });

  it('scrolls a newly navigated feed to the top when the forward-nav flag is set, then clears it', () => {
    const { rerender } = render(makeTree());
    setScrollY(2000);
    fireEvent.scroll(window);

    // User clicks a feed nav entry point: it sets the flag, then the route changes.
    window.sessionStorage.setItem(FORCE_FEED_SCROLL_TOP_KEY, '1');
    goTo('/bookmarks');
    rerender(makeTree());

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(window.sessionStorage.getItem(FORCE_FEED_SCROLL_TOP_KEY)).toBeNull();
  });

  it('does NOT force-scroll a feed navigated to without the flag (browser back between feeds)', () => {
    const { rerender } = render(makeTree());
    setScrollY(2000);
    fireEvent.scroll(window);

    // No flag set (e.g. browser back) -> native scroll restoration is preserved.
    goTo('/bookmarks');
    rerender(makeTree());

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('never tracks a non-feed pathname as a feed, nor lets its scroll contaminate the saved offset', () => {
    const { rerender } = render(makeTree());
    setScrollY(500);
    fireEvent.scroll(window);

    // Open a post from /home.
    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());

    // Close onto a NON-feed pathname (resolved === null).
    goTo('/notifications', { isFeed: false });
    rerender(makeTree());
    // (a) No restore, and the non-feed pathname is not recorded as a feed.
    expect(scrollToSpy).not.toHaveBeenCalled();

    // (b) Scrolling on the non-feed pathname must not change the saved offset.
    setScrollY(9999);
    fireEvent.scroll(window);

    // Reopen a post, then close back to /home -> same-route restore.
    goTo('/post/alice/123', { postActive: true, isFeed: false });
    rerender(makeTree());
    goTo('/home');
    rerender(makeTree());

    // Restored to the original feed offset (500), NOT the non-feed scroll (9999).
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 500, behavior: 'auto' });
  });
});
