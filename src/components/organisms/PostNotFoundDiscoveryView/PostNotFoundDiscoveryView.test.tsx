import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { PostNotFoundDiscoveryView } from './PostNotFoundDiscoveryView';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
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
  PostNotFound: ({ postId }: { postId: string }) => <div data-testid="post-not-found-mock" data-post-id={postId} />,
}));

const VALID_COMPOSITE = `${PUBKY_52_STAGING_FIXTURE}:${POST_ID_STAGING_FIXTURE}`;

describe('PostNotFoundDiscoveryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders HotDiscoveryContentLayout and trending section', () => {
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);

    expect(screen.getByTestId('hot-discovery-content-layout')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
    expect(screen.getByTestId('trending-heading')).toHaveTextContent('hot.trendingPosts');
  });

  it('passes postId to PostNotFound', () => {
    render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);
    expect(screen.getByTestId('post-not-found-mock')).toHaveAttribute('data-post-id', VALID_COMPOSITE);
  });
});

describe('PostNotFoundDiscoveryView - Snapshots', () => {
  it('matches snapshot when composite author is valid', () => {
    const { container } = render(<PostNotFoundDiscoveryView postId={VALID_COMPOSITE} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when composite author is invalid', () => {
    const invalid = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;
    const { container } = render(<PostNotFoundDiscoveryView postId={invalid} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
