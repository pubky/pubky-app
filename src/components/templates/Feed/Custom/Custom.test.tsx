import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Custom } from './Custom';

// Mock Organisms
vi.mock('@/organisms/AlertBackup/AlertBackup', () => {
  return {
    AlertBackup: () => <div data-testid="alert-backup">AlertBackup</div>,
  };
});

vi.mock('@/organisms/FeedNavigation/FeedNavigation', () => {
  return {
    FeedNavigation: ({ className }: { className?: string }) => (
      <div data-testid="feed-navigation" data-classname={className}>
        FeedNavigation
      </div>
    ),
  };
});

vi.mock('@/organisms/PostInput/PostInput', () => {
  return {
    PostInput: ({ variant }: { variant?: string }) => (
      <div data-testid="post-input" data-variant={variant}>
        PostInput
      </div>
    ),
  };
});

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => {
  return {
    TimelineFeed: ({ children, variant }: { children: React.ReactNode; variant: string }) => (
      <div data-testid="timeline-feed" data-variant={variant}>
        {children}
      </div>
    ),
  };
});

// Mock constants
vi.mock('@/organisms/PostInput/PostInput.constants', () => ({
  POST_INPUT_VARIANT: {
    POST: 'post',
  },
}));

vi.mock('@/config/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/feed')>();
  return {
    ...actual,
    TIMELINE_FEED_VARIANT: {
      ...actual.TIMELINE_FEED_VARIANT,
      CUSTOM: 'custom',
    },
  };
});

describe('Custom', () => {
  it('renders AlertBackup', () => {
    render(<Custom />);
    expect(screen.getByTestId('alert-backup')).toBeInTheDocument();
  });

  it('renders FeedNavigation edge-to-edge on mobile in main content', () => {
    render(<Custom />);
    const feedNavs = screen.getAllByTestId('feed-navigation');
    const mainFeedNav = feedNavs.find((el) => el.getAttribute('data-classname') === '-mx-6 w-auto lg:mx-0 lg:w-full');
    expect(mainFeedNav).toBeInTheDocument();
  });

  it('renders TimelineFeed with CUSTOM variant', () => {
    render(<Custom />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'custom');
  });

  it('renders PostInput inside TimelineFeed', () => {
    render(<Custom />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toContainElement(postInput);
  });

  it('renders PostInput with POST variant', () => {
    render(<Custom />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toHaveAttribute('data-variant', 'post');
  });

  it('does not render a ContentLayout shell (hoisted into (feeds)/layout.tsx)', () => {
    render(<Custom />);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
  });
});

describe('Custom - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Custom />);
    expect(container).toMatchSnapshot();
  });
});
