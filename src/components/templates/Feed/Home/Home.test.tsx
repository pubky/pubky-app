import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';

const vibesAlert = vi.hoisted(() => ({ visible: false }));
vi.mock('@/hooks/useVibesAlert/useVibesAlert', () => ({
  useVibesAlert: () => ({ visible: vibesAlert.visible, remindLater: () => {} }),
}));

// Mock Organisms
vi.mock('@/organisms/AlertVibes/AlertVibes', () => ({
  AlertVibes: () => <div data-testid="alert-vibes">AlertVibes</div>,
}));

vi.mock('@/organisms/AlertBackup/AlertBackup', () => {
  return {
    AlertBackup: () => <div data-testid="alert-backup">AlertBackup</div>,
  };
});

vi.mock('@/organisms/AlertInstall/AlertInstall', () => {
  return {
    AlertInstall: ({ hidden = false }: { hidden?: boolean }) => (
      <div data-testid="alert-install" data-hidden={hidden}>
        AlertInstall
      </div>
    ),
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

const mockUseDefaultHomeReach = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDefaultHomeReach/useDefaultHomeReach', () => ({
  useDefaultHomeReach: mockUseDefaultHomeReach,
}));

vi.mock('@/molecules/TaggedAsHeadline/TaggedAsHeadline', () => ({
  TaggedAsHeadline: () => <div data-testid="tagged-as-headline">TaggedAsHeadline</div>,
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => {
  return {
    TimelineFeed: ({
      children,
      persistentHeader,
      variant,
    }: {
      children: React.ReactNode;
      persistentHeader?: React.ReactNode;
      variant: string;
    }) => (
      <div data-testid="timeline-feed" data-variant={variant}>
        {children}
        {persistentHeader}
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
    vibesAlert.visible = false;
  });

  it('renders DialogWelcome', () => {
    render(<Home />);
    expect(screen.getByTestId('dialog-welcome')).toBeInTheDocument();
  });

  it('renders AlertBackup', () => {
    render(<Home />);
    expect(screen.getByTestId('alert-backup')).toBeInTheDocument();
  });

  it('places the Vibes, install and backup alerts between FeedNavigation and the composer', () => {
    render(<Home />);
    const alertVibes = screen.getByTestId('alert-vibes');
    const alertInstall = screen.getByTestId('alert-install');
    expect(screen.getByTestId('feed-navigation').nextElementSibling).toBe(alertVibes);
    expect(alertVibes.nextElementSibling).toBe(alertInstall);
    expect(alertInstall.nextElementSibling).toBe(screen.getByTestId('alert-backup'));
    expect(alertVibes.compareDocumentPosition(screen.getByTestId('post-input'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('holds back the install banner while the Vibes alert is showing', () => {
    const { rerender } = render(<Home />);
    expect(screen.getByTestId('alert-install')).toHaveAttribute('data-hidden', 'false');
    vibesAlert.visible = true;
    rerender(<Home />);
    expect(screen.getByTestId('alert-install')).toHaveAttribute('data-hidden', 'true');
  });

  it('renders FeedNavigation in main content', () => {
    render(<Home />);
    expect(screen.getByTestId('feed-navigation')).toBeInTheDocument();
  });

  it('renders TimelineFeed with HOME variant', () => {
    render(<Home />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'home');
  });

  it('starts the asynchronous fresh-user reach resolution', () => {
    render(<Home />);

    expect(mockUseDefaultHomeReach).toHaveBeenCalledTimes(1);
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

  it('passes the Tagged-as headline through the persistent header slot', () => {
    render(<Home />);

    expect(screen.getByTestId('timeline-feed')).toContainElement(screen.getByTestId('tagged-as-headline'));
  });

  it('does not render a ContentLayout shell (hoisted into (feeds)/layout.tsx)', () => {
    render(<Home />);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
  });
});
