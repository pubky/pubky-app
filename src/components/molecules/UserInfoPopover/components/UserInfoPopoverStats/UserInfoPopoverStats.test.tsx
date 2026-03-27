import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserInfoPopoverStats } from './UserInfoPopoverStats';

vi.mock('@/molecules', () => ({
  AvatarGroup: ({ totalCount }: { totalCount: number }) => <div data-testid="avatar-group">{totalCount}</div>,
}));

describe('UserInfoPopoverStats', () => {
  it('renders followers/following labels and counts', () => {
    render(
      <UserInfoPopoverStats
        followersCount={10}
        followingCount={3}
        followersAvatars={[{ id: '1', name: 'A' }]}
        followingAvatars={[]}
        maxAvatars={3}
      />,
    );
    expect(screen.getByText('FOLLOWERS')).toBeInTheDocument();
    expect(screen.getByText('FOLLOWING')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, el) => (el?.textContent || '').replace(/\s+/g, ' ').trim() === '10 FOLLOWERS').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, el) => (el?.textContent || '').replace(/\s+/g, ' ').trim() === '3 FOLLOWING').length,
    ).toBeGreaterThan(0);
  });
});

describe('UserInfoPopoverStats - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(
      <UserInfoPopoverStats
        followersCount={10}
        followingCount={3}
        followersAvatars={[{ id: '1', name: 'A' }]}
        followingAvatars={[{ id: '2', name: 'B' }]}
        maxAvatars={3}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
