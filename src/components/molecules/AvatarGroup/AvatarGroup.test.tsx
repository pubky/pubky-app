import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarGroup } from './AvatarGroup';

describe('AvatarGroup', () => {
  const defaultItems = [
    { id: '1', name: 'User 1', avatarUrl: 'https://example.com/avatar1.png' },
    { id: '2', name: 'User 2', avatarUrl: 'https://example.com/avatar2.png' },
  ];

  it('renders with items', () => {
    render(<AvatarGroup items={defaultItems} totalCount={2} data-testid="avatar-group" />);

    // Should render the container with avatars
    const avatarGroup = screen.getByTestId('avatar-group');
    expect(avatarGroup).toBeInTheDocument();
  });

  it('returns null when items array is empty', () => {
    const { container } = render(<AvatarGroup items={[]} totalCount={0} />);

    expect(container.firstChild).toBeNull();
  });

  it('limits visible avatars to maxAvatars', () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    const { container } = render(<AvatarGroup items={manyItems} totalCount={100} maxAvatars={3} />);

    // Should only show 3 avatars + overflow indicator
    const avatarWrappers = container.querySelectorAll('.rounded-full.shadow-xs');
    // 3 visible avatars + 1 overflow indicator
    expect(avatarWrappers.length).toBe(4);
  });

  it('shows overflow based on totalCount minus visible avatars', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // totalCount is 100, showing 6 avatars → overflow is 100 - 6 = 94
    render(<AvatarGroup items={items} totalCount={100} maxAvatars={6} />);

    expect(screen.getByText('+94')).toBeInTheDocument();
  });

  it('shows correct overflow for smaller totalCount', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // totalCount is 50, showing 6 avatars → overflow is 50 - 6 = 44
    render(<AvatarGroup items={items} totalCount={50} maxAvatars={6} />);

    expect(screen.getByText('+44')).toBeInTheDocument();
  });

  it('does not show overflow when totalCount equals visible avatars', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // totalCount is 6, showing 6 avatars → no overflow
    render(<AvatarGroup items={items} totalCount={6} maxAvatars={6} />);

    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('caps overflow display at +99 for large totalCounts', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    // totalCount is 500, showing 6 avatars → overflow is 494 → +99
    render(<AvatarGroup items={items} totalCount={500} maxAvatars={6} />);

    expect(screen.getByText('+99')).toBeInTheDocument();
  });

  it('uses default maxAvatars of 6', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));

    const { container } = render(<AvatarGroup items={items} totalCount={100} />);

    // Should show 6 avatars + overflow indicator (7 rounded-full elements)
    const avatarWrappers = container.querySelectorAll('.rounded-full.shadow-xs');
    expect(avatarWrappers.length).toBe(7);
  });

  it('applies custom className', () => {
    render(<AvatarGroup items={defaultItems} totalCount={2} className="custom-class" data-testid="avatar-group" />);

    const avatarGroup = screen.getByTestId('avatar-group');
    expect(avatarGroup).toHaveClass('custom-class');
  });

  it('renders with custom data-testid', () => {
    render(<AvatarGroup items={defaultItems} totalCount={2} data-testid="custom-avatar-group" />);

    expect(screen.getByTestId('custom-avatar-group')).toBeInTheDocument();
  });

  it('handles items without avatarUrl (fallback)', () => {
    const itemsWithoutAvatar = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];

    const { container } = render(<AvatarGroup items={itemsWithoutAvatar} totalCount={2} />);

    // Should still render avatars (with fallback initials)
    const avatarWrappers = container.querySelectorAll('.rounded-full.shadow-xs');
    expect(avatarWrappers.length).toBe(2);
  });

  it('uses "User" as fallback name when name is undefined', () => {
    const itemsWithoutName = [{ id: '1' }, { id: '2' }];

    const { container } = render(<AvatarGroup items={itemsWithoutName} totalCount={2} />);

    // Should render without crashing
    expect(container.firstChild).not.toBeNull();
  });
});

describe('AvatarGroup - Snapshots', () => {
  it('matches snapshot with basic items', () => {
    const items = [
      { id: '1', name: 'Alice', avatarUrl: 'https://example.com/alice.png' },
      { id: '2', name: 'Bob', avatarUrl: 'https://example.com/bob.png' },
    ];
    const { container } = render(<AvatarGroup items={items} totalCount={2} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with overflow', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));
    const { container } = render(<AvatarGroup items={items} totalCount={100} maxAvatars={6} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with max overflow (+99)', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));
    const { container } = render(<AvatarGroup items={items} totalCount={500} maxAvatars={6} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with items without avatarUrl', () => {
    const items = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    const { container } = render(<AvatarGroup items={items} totalCount={2} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom maxAvatars', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
    }));
    const { container } = render(<AvatarGroup items={items} totalCount={50} maxAvatars={3} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
