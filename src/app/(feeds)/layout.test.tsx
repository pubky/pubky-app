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

  it('throws on an unknown pathname when the (.)post slot is NOT active, even with a cached config', () => {
    // This is the config-drift guard: someone adds `(feeds)/notifications/` without
    // a matching entry in `_shell/configs.tsx`. The layout must not silently render
    // stale chrome from a previously-visited feed route — it must throw.
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

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      rerender(
        <FeedsLayout post={<div data-testid="post">post</div>}>
          <div data-testid="feed-content">Feed</div>
        </FeedsLayout>,
      ),
    ).toThrow(/\[FeedsLayout\] No feeds shell config for pathname "\/notifications"/);

    errorSpy.mockRestore();
  });
});
