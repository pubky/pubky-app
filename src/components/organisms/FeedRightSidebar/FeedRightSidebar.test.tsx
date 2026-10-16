import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { tryResolveFeedsShellConfig } from '@/app/(feeds)/_shell/configs';
import {
  HomeFeedRightDrawer,
  HomeFeedRightDrawerMobile,
  HomeFeedRightSidebar,
  HotFeedRightDrawer,
  HotFeedRightSidebar,
} from './FeedRightSidebar';

// Mock Molecules
vi.mock('@/organisms/VibesCard/VibesCard', () => ({
  VibesCard: () => <div data-testid="vibes-card">VibesCard</div>,
}));

describe('Vibes sidebar placement', () => {
  it.each(['rightSidebarContent', 'rightDrawerContent', 'rightDrawerContentMobile'] as const)(
    'keeps the permanent Home entry in %s',
    (content) => {
      render(tryResolveFeedsShellConfig('/home')![content]);
      expect(screen.getByTestId('feedback-card').previousElementSibling).toBe(screen.getByTestId('vibes-card'));
    },
  );

  it.each(['/feed/abc', '/search'])('keeps Vibes out of the %s drawers and sidebar', (pathname) => {
    const config = tryResolveFeedsShellConfig(pathname)!;
    render(
      <>
        {config.rightSidebarContent}
        {config.rightDrawerContent}
        {config.rightDrawerContentMobile}
      </>,
    );
    expect(screen.queryByTestId('vibes-card')).not.toBeInTheDocument();
  });

  it('places Vibes directly above Feedback in the Home sidebar', () => {
    render(<HomeFeedRightSidebar showVibes />);
    expect(screen.getByTestId('feedback-card').previousElementSibling).toBe(screen.getByTestId('vibes-card'));
  });

  it.each([HomeFeedRightSidebar, HomeFeedRightDrawer, HomeFeedRightDrawerMobile])(
    'excludes Vibes from other regular feed surfaces',
    (Surface) => {
      render(<Surface />);
      expect(screen.queryByTestId('vibes-card')).not.toBeInTheDocument();
    },
  );

  it.each([HotFeedRightSidebar, HotFeedRightDrawer])('places Vibes directly above Hot feedback', (Sidebar) => {
    render(<Sidebar />);
    expect(screen.getByTestId('feedback-card').previousElementSibling).toBe(screen.getByTestId('vibes-card'));
  });
});

// Mock Organisms
vi.mock('@/organisms/ActiveUsers/ActiveUsers', () => {
  return {
    ActiveUsers: () => <div data-testid="active-users">ActiveUsers</div>,
  };
});

vi.mock('@/organisms/FeedbackCard/FeedbackCard', () => {
  return {
    FeedbackCard: () => <div data-testid="feedback-card">FeedbackCard</div>,
  };
});

vi.mock('@/organisms/HotTags/HotTags', () => {
  return {
    HotTags: () => <div data-testid="hot-tags">HotTags</div>,
  };
});

vi.mock('@/organisms/WhoToFollowSidebar/WhoToFollowSidebar', () => {
  return {
    WhoToFollowSidebar: () => <div data-testid="who-to-follow">WhoToFollowSidebar</div>,
  };
});

describe('HomeFeedRightSidebar', () => {
  it('renders all components', () => {
    render(<HomeFeedRightSidebar />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });
});

describe('HomeFeedRightDrawer', () => {
  it('renders all components', () => {
    render(<HomeFeedRightDrawer />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });
});

describe('HotFeedRightSidebar', () => {
  it('renders WhoToFollow and FeedbackCard', () => {
    render(<HotFeedRightSidebar />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });
});

describe('HomeFeedRightDrawerMobile', () => {
  it('renders recommendations, tags and feedback in order without active users', () => {
    render(<HomeFeedRightDrawerMobile />);

    expect(screen.queryByTestId('active-users')).not.toBeInTheDocument();
    expect(
      screen.getAllByTestId(/who-to-follow|hot-tags|feedback-card/).map((section) => section.dataset.testid),
    ).toEqual(['who-to-follow', 'hot-tags', 'feedback-card']);
  });
});
describe('HotFeedRightDrawer', () => {
  it('renders WhoToFollow and FeedbackCard', () => {
    render(<HotFeedRightDrawer />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });
});
