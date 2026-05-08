import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfoPopoverContent } from './UserInfoPopoverContent';

vi.mock('@/hooks/useUserInfoPopoverData/useUserInfoPopoverData', () => ({
  useUserInfoPopoverData: () => ({
    isCurrentUser: false,
    isLoading: false,
    profileBio: 'Bio',
    profileAvatarUrl: 'profile-avatar',
    followers: [],
    following: [],
    followersCount: 0,
    followingCount: 0,
    statsFollowers: 0,
    statsFollowing: 0,
    isFollowing: false,
    isFollowingStatusLoading: false,
  }),
}));

vi.mock('@/hooks/useUserInfoPopoverActions/useUserInfoPopoverActions', () => ({
  useUserInfoPopoverActions: () => ({
    isLoading: false,
    onEditClick: vi.fn(),
    onFollowClick: vi.fn(),
  }),
}));

vi.mock('@/molecules/PostText/PostText', () => {
  return {
    PostText: ({ content }: { content: string }) => <div data-testid="post-text">{content}</div>,
  };
});

vi.mock('../UserInfoPopoverHeader/UserInfoPopoverHeader', () => ({
  UserInfoPopoverHeader: () => <div data-testid="header" />,
}));
vi.mock('../UserInfoPopoverStats/UserInfoPopoverStats', () => ({
  UserInfoPopoverStats: () => <div data-testid="stats" />,
}));
vi.mock('../UserInfoPopoverFollowButton/UserInfoPopoverFollowButton', () => ({
  UserInfoPopoverFollowButton: () => <div data-testid="follow-button" />,
}));
vi.mock('./UserInfoPopoverContent.skeleton', () => ({
  UserInfoPopoverSkeleton: () => <div data-testid="skeleton" />,
}));
describe('UserInfoPopoverContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all sections', () => {
    render(<UserInfoPopoverContent userId="user123" userName="User" avatarUrl="avatar" formattedPublicKey="pubkey" />);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('stats')).toBeInTheDocument();
    expect(screen.getByTestId('follow-button')).toBeInTheDocument();
  });
});

describe('UserInfoPopoverContent - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(
      <UserInfoPopoverContent userId="user123" userName="User" avatarUrl="avatar" formattedPublicKey="pubkey" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
