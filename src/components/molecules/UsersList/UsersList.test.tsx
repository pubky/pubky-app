import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserData } from '../User/User';
import { UsersList } from './UsersList';

const mockUsers: UserData[] = [
  {
    id: '1',
    name: 'Anna Pleb',
    handle: '7SL4...98V5',
    avatar: '/avatar1.jpg',
  },
  {
    id: '2',
    name: 'Carl Smith',
    handle: '327F...2YM4',
    avatar: '/avatar2.jpg',
  },
  {
    id: '3',
    name: 'Mi Lei',
    handle: 'PL5Z...2JSL',
    avatar: '/avatar3.jpg',
  },
  {
    id: '4',
    name: 'John Doe',
    handle: 'ABC1...XYZ9',
    avatar: '/avatar4.jpg',
  },
];

describe('UsersList', () => {
  it('renders the component without title by default', () => {
    render(<UsersList users={mockUsers} />);

    // Should not render any title when not provided
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders the component with custom title', () => {
    render(<UsersList users={mockUsers} title="Who to follow" />);

    expect(screen.getByText('Who to follow')).toBeInTheDocument();
  });

  it('does not render title when title is empty string', () => {
    render(<UsersList users={mockUsers} title="" />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders up to 3 users by default', () => {
    render(<UsersList users={mockUsers} />);

    expect(screen.getByText('Anna Pleb')).toBeInTheDocument();
    expect(screen.getByText('Carl Smith')).toBeInTheDocument();
    expect(screen.getByText('Mi Lei')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('renders custom max users when specified', () => {
    render(<UsersList users={mockUsers} maxUsers={2} />);

    expect(screen.getByText('Anna Pleb')).toBeInTheDocument();
    expect(screen.getByText('Carl Smith')).toBeInTheDocument();
    expect(screen.queryByText('Mi Lei')).not.toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('shows "See all" button when there are more users than maxUsers', () => {
    render(<UsersList users={mockUsers} maxUsers={3} />);

    expect(screen.getByTestId('see-all-button')).toBeInTheDocument();
    expect(screen.getByText('See all')).toBeInTheDocument();
  });

  it('does not show "See all" button when users are less than or equal to maxUsers', () => {
    render(<UsersList users={mockUsers.slice(0, 2)} maxUsers={3} />);

    expect(screen.queryByTestId('see-all-button')).not.toBeInTheDocument();
  });

  it('calls onFollow when follow button is clicked', () => {
    const mockOnFollow = vi.fn();
    render(<UsersList users={mockUsers} onFollow={mockOnFollow} />);

    const followButton = screen.getByTestId('user-action-1');
    fireEvent.click(followButton);

    expect(mockOnFollow).toHaveBeenCalledWith('1');
  });

  it('does not render action buttons when onFollow is not provided', () => {
    render(<UsersList users={mockUsers} />);

    expect(screen.queryByTestId('user-action-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-action-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-action-3')).not.toBeInTheDocument();
  });

  it('calls onSeeAll when "See all" button is clicked', () => {
    const mockOnSeeAll = vi.fn();
    render(<UsersList users={mockUsers} onSeeAll={mockOnSeeAll} />);

    const seeAllButton = screen.getByTestId('see-all-button');
    fireEvent.click(seeAllButton);

    expect(mockOnSeeAll).toHaveBeenCalled();
  });

  it('renders user avatars with fallback initials', () => {
    render(<UsersList users={mockUsers} />);

    // Check that avatars are rendered by looking for user avatars
    const avatars = screen.getAllByTestId('user-avatar');
    expect(avatars).toHaveLength(3);
  });

  it('renders user handles correctly', () => {
    render(<UsersList users={mockUsers} />);

    expect(screen.getByText('7SL4...98V5')).toBeInTheDocument();
    expect(screen.getByText('327F...2YM4')).toBeInTheDocument();
    expect(screen.getByText('PL5Z...2JSL')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const customClass = 'custom-class';
    const { container } = render(<UsersList users={mockUsers} className={customClass} />);

    expect(container.firstChild).toHaveClass(customClass);
  });

  it('handles empty users array', () => {
    render(<UsersList users={[]} />);

    expect(screen.queryByTestId('see-all-button')).not.toBeInTheDocument();
  });
});
