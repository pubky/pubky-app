import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HomeFeedRightDrawer,
  HomeFeedRightDrawerMobile,
  HomeFeedRightSidebar,
  HotFeedRightDrawer,
  HotFeedRightSidebar,
} from './FeedRightSidebar';

// Mock Molecules
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

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedRightSidebar />);
    expect(container).toMatchSnapshot();
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

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedRightDrawer />);
    expect(container).toMatchSnapshot();
  });
});

describe('HotFeedRightSidebar', () => {
  it('renders WhoToFollow and FeedbackCard', () => {
    render(<HotFeedRightSidebar />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HotFeedRightSidebar />);
    expect(container).toMatchSnapshot();
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

describe('HomeFeedRightDrawerMobile - Snapshots', () => {
  it('matches snapshot with the phone sidebar content', () => {
    const { container } = render(<HomeFeedRightDrawerMobile />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('HotFeedRightDrawer', () => {
  it('renders WhoToFollow and FeedbackCard', () => {
    render(<HotFeedRightDrawer />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HotFeedRightDrawer />);
    expect(container).toMatchSnapshot();
  });
});
