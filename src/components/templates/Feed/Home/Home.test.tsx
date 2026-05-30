import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

// Mock Organisms
vi.mock('@/organisms/AlertBackup/AlertBackup', () => {
  return {
    AlertBackup: () => <div data-testid="alert-backup">AlertBackup</div>,
  };
});

vi.mock('@/organisms/DialogWelcome/DialogWelcome', () => {
  return {
    DialogWelcome: () => <div data-testid="dialog-welcome">DialogWelcome</div>,
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
    PostInput: ({ dataCy, variant }: { dataCy?: string; variant?: string }) => (
      <div data-testid="post-input" data-cy={dataCy} data-variant={variant}>
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
      HOME: 'home',
    },
  };
});

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('renders DialogWelcome', () => {
    render(<Home />);
    expect(screen.getByTestId('dialog-welcome')).toBeInTheDocument();
  });

  it('renders AlertBackup', () => {
    render(<Home />);
    expect(screen.getByTestId('alert-backup')).toBeInTheDocument();
  });

  it('renders FeedNavigation in main content with hidden lg:flex class', () => {
    render(<Home />);
    const feedNavs = screen.getAllByTestId('feed-navigation');
    const mainFeedNav = feedNavs.find((el) => el.getAttribute('data-classname') === 'hidden lg:flex');
    expect(mainFeedNav).toBeInTheDocument();
  });

  it('renders TimelineFeed with HOME variant', () => {
    render(<Home />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'home');
  });

  it('renders PostInput inside TimelineFeed', () => {
    render(<Home />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toContainElement(postInput);
  });

  it('renders PostInput with correct props', () => {
    render(<Home />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toHaveAttribute('data-cy', 'home-post-input');
    expect(postInput).toHaveAttribute('data-variant', 'post');
  });

  it('does not render a ContentLayout shell (hoisted into (feeds)/layout.tsx)', () => {
    render(<Home />);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
  });
});

describe('Home — force-scroll-top behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('forces scroll to top when flagged before entering /home', () => {
    window.sessionStorage.setItem(FORCE_HOME_SCROLL_TOP_KEY, '1');

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    render(<Home />);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(window.sessionStorage.getItem(FORCE_HOME_SCROLL_TOP_KEY)).toBeNull();
  });

  it('does not scroll when flag is absent', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    render(<Home />);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('Home - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Home />);
    expect(container).toMatchSnapshot();
  });
});
