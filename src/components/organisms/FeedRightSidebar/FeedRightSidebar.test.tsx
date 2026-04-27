import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  HomeFeedRightSidebar,
  HomeFeedRightDrawer,
  HomeFeedRightDrawerMobile,
  HotFeedRightSidebar,
  HotFeedRightDrawer,
} from './FeedRightSidebar';

// Mock Molecules
vi.mock('@/molecules', () => ({
  FeedSection: () => <div data-testid="feed-section">FeedSection</div>,
}));

// Mock Organisms
vi.mock('@/organisms', () => ({
  WhoToFollow: () => <div data-testid="who-to-follow">WhoToFollow</div>,
  ActiveUsers: () => <div data-testid="active-users">ActiveUsers</div>,
  HotTags: () => <div data-testid="hot-tags">HotTags</div>,
  FeedbackCard: () => <div data-testid="feedback-card">FeedbackCard</div>,
}));

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

describe('HomeFeedRightDrawerMobile', () => {
  it('renders FeedSection', () => {
    render(<HomeFeedRightDrawerMobile />);

    expect(screen.getByTestId('feed-section')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedRightDrawerMobile />);
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
