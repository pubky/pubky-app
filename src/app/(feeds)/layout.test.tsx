import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
