import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { PostNotFoundDiscoveryView } from './PostNotFoundDiscoveryView';

const mockPush = vi.fn();
const mockUseLayoutReset = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('@/hooks/useLayoutReset/useLayoutReset', () => ({
  useLayoutReset: () => mockUseLayoutReset(),
}));

vi.mock('@/organisms/HotDiscoveryContentLayout/HotDiscoveryContentLayout', () => ({
  HotDiscoveryContentLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hot-discovery-content-layout">{children}</div>
  ),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: () => <div data-testid="timeline-feed" />,
}));

vi.mock('@/atoms/Heading/Heading', () => ({
  Heading: ({ children }: { children: React.ReactNode }) => <h5 data-testid="trending-heading">{children}</h5>,
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <div data-testid="container" data-override={overrideDefaults} className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/molecules/PostNotFound/PostNotFound', () => ({
  PostNotFound: ({
    title,
    subtitle: _subtitle,
    imageAlt: _imageAlt,
    backToFeedLabel,
    viewProfileLabel,
    exploreTagsLabel,
    onBackToFeed,
    onViewProfile,
    onExploreTags,
  }: {
    title: string;
    subtitle: string;
    imageAlt: string;
    backToFeedLabel: string;
    viewProfileLabel: string;
    exploreTagsLabel: string;
    onBackToFeed: () => void;
    onViewProfile?: () => void;
    onExploreTags: () => void;
  }) => (
    <div data-testid="post-not-found-mock" data-title={title} data-has-view-profile={Boolean(onViewProfile)}>
      <button type="button" data-testid="mock-back-to-feed" onClick={onBackToFeed}>
        {backToFeedLabel}
      </button>
      {onViewProfile ? (
        <button type="button" data-testid="mock-view-profile" onClick={onViewProfile}>
          {viewProfileLabel}
        </button>
      ) : null}
      <button type="button" data-testid="mock-explore-tags" onClick={onExploreTags}>
        {exploreTagsLabel}
      </button>
    </div>
  ),
}));

const VALID_COMPOSITE = `${PUBKY_52_STAGING_FIXTURE}:${POST_ID_STAGING_FIXTURE}`;

describe('PostNotFoundDiscoveryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls useLayoutReset on mount', () => {
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);
    expect(mockUseLayoutReset).toHaveBeenCalledTimes(1);
  });

  it('renders HotDiscoveryContentLayout and trending section', () => {
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);

    expect(screen.getByTestId('hot-discovery-content-layout')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
    expect(screen.getByTestId('trending-heading')).toHaveTextContent('hot.trendingPosts');
  });

  it('shows View profile when author pubky in composite is valid', () => {
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);
    expect(screen.getByTestId('post-not-found-mock')).toHaveAttribute('data-has-view-profile', 'true');
  });

  it('hides View profile when composite author is not a valid pubky', () => {
    const invalid = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;
    render(<PostNotFoundDiscoveryView postId={invalid} />);
    expect(screen.getByTestId('post-not-found-mock')).toHaveAttribute('data-has-view-profile', 'false');
  });

  it('passes translated strings into PostNotFound', () => {
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);
    expect(screen.getByTestId('post-not-found-mock')).toHaveAttribute('data-title', 'post.notFound.title');
  });

  it('navigates home, profile, and hot from actions', async () => {
    const user = userEvent.setup();
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);

    await user.click(screen.getByTestId('mock-back-to-feed'));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOME);

    await user.click(screen.getByTestId('mock-view-profile'));
    expect(mockPush).toHaveBeenCalledWith(getProfileRoute(PROFILE_ROUTES.PROFILE, PUBKY_52_STAGING_FIXTURE));

    await user.click(screen.getByTestId('mock-explore-tags'));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOT);
  });
});
