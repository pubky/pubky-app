import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';
import type { ProfileStats } from '@/hooks/useProfileStats/useProfileStats.types';
import { getDefaultItems, ProfilePageFilterBar } from './ProfilePageFilterBar';

const mockStats: ProfileStats = {
  notifications: 2,
  posts: 4,
  replies: 7,
  collections: 3,
  followers: 115,
  following: 27,
  friends: 10,
  uniqueTags: 5,
};

describe('ProfilePageFilterBar', () => {
  it('renders all filter items with stats', () => {
    const { container } = render(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={mockStats}
      />,
    );
    // Check that filter items are rendered with their translated labels
    // The component uses t(item.labelKey) to translate labels
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('Replies')).toBeInTheDocument();
    expect(screen.getByText('Followers')).toBeInTheDocument();
    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.getByText('Tagged')).toBeInTheDocument();

    // Check that counts are rendered
    expect(screen.getByText('2')).toBeInTheDocument(); // notifications
    expect(screen.getByText('4')).toBeInTheDocument(); // posts
    expect(container.querySelector('[data-cy="profile-filter-item-collections-count"]')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // collections
  });

  it('has correct structure with sticky positioning', () => {
    const { container } = render(
      <ProfilePageFilterBar activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass(
      'sticky',
      'top-(--header-height)',
      'hidden',
      'h-fit',
      'w-(--filter-bar-width)',
      'flex-col',
      'self-start',
      'lg:flex',
    );
  });

  it('renders correct number of filter items', () => {
    const { container } = render(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={mockStats}
      />,
    );
    const filterItems = container.querySelectorAll('[data-slot="filter-item"]');
    expect(filterItems.length).toBe(getDefaultItems(mockStats).length);
  });

  it('renders with loading spinners when no stats provided', () => {
    render(<ProfilePageFilterBar activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    // Should show loading spinners when stats are undefined
    const spinners = screen.getAllByTestId('spinner');
    expect(spinners.length).toBe(8); // One for each filter item with a count
  });

  it('renders with zero counts when stats are provided but individual values are zero', () => {
    const zeroStats: ProfileStats = {
      notifications: 0,
      posts: 0,
      replies: 0,
      collections: 0,
      followers: 0,
      following: 0,
      friends: 0,
      uniqueTags: 0,
    };
    render(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={zeroStats}
      />,
    );
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    // Should show 0 for all counts when stats are provided with zero values
    const counts = screen.getAllByText('0');
    expect(counts.length).toBe(8);
  });

  it('marks active item correctly', () => {
    render(<ProfilePageFilterBar activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />);
    const activeItem = screen.getByText('Notifications').closest('[data-slot="filter-item"]');
    expect(activeItem).toHaveAttribute('data-selected', 'true');

    const inactiveItem = screen.getByText('Posts').closest('[data-slot="filter-item"]');
    expect(inactiveItem).toHaveAttribute('data-selected', 'false');
  });

  it('applies correct count styling for active and inactive items', () => {
    render(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={mockStats}
      />,
    );
    const activeCount = screen.getByText('2').closest('span');
    expect(activeCount).toHaveClass('text-foreground');

    const inactiveCount = screen.getByText('4').closest('span');
    expect(inactiveCount).toHaveClass('text-muted-foreground');
  });

  it('renders with custom items', () => {
    const customItems = [
      {
        icon: () => <span>Icon</span>,
        labelKey: 'notifications',
        count: 10,
        pageType: PROFILE_PAGE_TYPES.NOTIFICATIONS,
      },
    ];
    render(
      <ProfilePageFilterBar
        items={customItems}
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
      />,
    );
    // labelKey 'notifications' translates to 'Notifications' in en.json profile.tabs namespace
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders custom items with loading state', () => {
    const customItems = [
      {
        icon: () => <span>Icon</span>,
        labelKey: 'posts',
        count: undefined,
        pageType: PROFILE_PAGE_TYPES.NOTIFICATIONS,
      },
    ];
    render(
      <ProfilePageFilterBar
        items={customItems}
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
      />,
    );
    // labelKey 'posts' translates to 'Posts' in en.json profile.tabs namespace
    expect(screen.getByText('Posts')).toBeInTheDocument();
    const spinners = screen.getAllByTestId('spinner');
    expect(spinners.length).toBe(1);
  });

  it('transitions from loading to loaded state', () => {
    const { rerender } = render(
      <ProfilePageFilterBar activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );

    // Initially should show spinners
    let spinners = screen.getAllByTestId('spinner');
    expect(spinners.length).toBe(8);

    // After stats are provided, should show counts
    rerender(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={mockStats}
      />,
    );

    spinners = screen.queryAllByTestId('spinner');
    expect(spinners.length).toBe(0);
    expect(screen.getByText('2')).toBeInTheDocument(); // notifications count
    expect(screen.getByText('4')).toBeInTheDocument(); // posts count
  });
});

describe('ProfilePageFilterBar - Snapshots', () => {
  it('matches snapshot with stats', () => {
    const { container } = render(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={mockStats}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loading state (no stats)', () => {
    const { container } = render(
      <ProfilePageFilterBar activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with zero stats', () => {
    const zeroStats: ProfileStats = {
      notifications: 0,
      posts: 0,
      replies: 0,
      collections: 0,
      followers: 0,
      following: 0,
      friends: 0,
      uniqueTags: 0,
    };
    const { container } = render(
      <ProfilePageFilterBar
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
        stats={zeroStats}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom items', () => {
    const customItems = [
      {
        icon: () => <span>Icon</span>,
        labelKey: 'notifications',
        count: 10,
        pageType: PROFILE_PAGE_TYPES.NOTIFICATIONS,
      },
    ];
    const { container } = render(
      <ProfilePageFilterBar
        items={customItems}
        activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS}
        onPageChangeAction={() => {}}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
