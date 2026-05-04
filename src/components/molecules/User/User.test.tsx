import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { User, type UserData } from './User';
import { ButtonVariant } from '@/atoms/Button/Button';

// Mock AvatarWithFallback to isolate User component tests
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({
      name,
      avatarUrl,
      'data-testid': dataTestId,
    }: {
      name: string;
      avatarUrl?: string;
      size?: string;
      alt?: string;
      'data-testid'?: string;
    }) => <div data-testid={dataTestId} className="h-8 w-8" data-name={name} data-avatar-url={avatarUrl} />,
  };
});

const mockUser: UserData = {
  id: '1',
  name: 'Anna Pleb',
  handle: '7SL4...98V5',
  avatar: '/avatar1.jpg',
};

describe('User', () => {
  it('renders user information correctly', () => {
    render(<User user={mockUser} />);

    expect(screen.getByText('Anna Pleb')).toBeInTheDocument();
    expect(screen.getByText('7SL4...98V5')).toBeInTheDocument();
    expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
  });

  it('renders with custom data-testid', () => {
    render(<User user={mockUser} data-testid="custom-user" />);

    expect(screen.getByTestId('custom-user')).toBeInTheDocument();
  });

  it('calls onAction when action button is clicked', () => {
    const mockOnAction = vi.fn();
    render(<User user={mockUser} onAction={mockOnAction} showAction={true} />);

    const actionButton = screen.getByTestId('user-action-1');
    fireEvent.click(actionButton);

    expect(mockOnAction).toHaveBeenCalledWith('1');
  });

  it('renders custom action icon', () => {
    const customIcon = <span data-testid="custom-icon">Custom</span>;
    render(<User user={mockUser} onAction={() => {}} actionIcon={customIcon} showAction={true} />);

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders action button by default when showAction is true', () => {
    render(<User user={mockUser} onAction={() => {}} showAction={true} />);

    expect(screen.getByTestId('user-action-1')).toBeInTheDocument();
  });

  it('does not render action button when showAction is false', () => {
    render(<User user={mockUser} showAction={false} />);

    expect(screen.queryByTestId('user-action-1')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const customClass = 'custom-class';
    const { container } = render(<User user={mockUser} className={customClass} />);

    expect(container.firstChild).toHaveClass(customClass);
  });

  it('renders avatar with md size', () => {
    render(<User user={mockUser} />);
    // Mock AvatarWithFallback renders with h-8 w-8 classes
    expect(screen.getByTestId('user-avatar')).toHaveClass('h-8', 'w-8');
  });

  it('renders with different action button variants', () => {
    const { rerender } = render(
      <User user={mockUser} onAction={() => {}} actionVariant={ButtonVariant.DEFAULT} showAction={true} />,
    );
    expect(screen.getByTestId('user-action-1')).toHaveAttribute('data-variant', 'default');

    rerender(<User user={mockUser} onAction={() => {}} actionVariant={ButtonVariant.GHOST} showAction={true} />);
    expect(screen.getByTestId('user-action-1')).toHaveAttribute('data-variant', 'ghost');
  });

  it('renders action button with default size', () => {
    render(<User user={mockUser} onAction={() => {}} showAction={true} />);
    expect(screen.getByTestId('user-action-1')).toHaveAttribute('data-size', 'sm');
  });

  it('renders user name and handle with default typography', () => {
    render(<User user={mockUser} />);
    expect(screen.getByTestId('user-name')).toBeInTheDocument();
    expect(screen.getByTestId('user-handle')).toBeInTheDocument();
  });

  it('renders tags and posts count when both are provided', () => {
    const userWithCounts = {
      ...mockUser,
      tagsCount: 5,
      postsCount: 12,
    };
    render(<User user={userWithCounts} />);

    expect(screen.getByTestId('user-name')).toBeInTheDocument();
    expect(screen.getByTestId('user-tags-count')).toBeInTheDocument();
    expect(screen.getByTestId('user-posts-count')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByTestId('user-handle')).not.toBeInTheDocument();
  });

  it('renders handle when tags or posts count are missing', () => {
    const userWithPartialCounts = {
      ...mockUser,
      tagsCount: 5,
      // postsCount is missing
    };
    render(<User user={userWithPartialCounts} />);

    expect(screen.getByTestId('user-name')).toBeInTheDocument();
    expect(screen.getByTestId('user-handle')).toBeInTheDocument();
    expect(screen.queryByTestId('user-tags-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-posts-count')).not.toBeInTheDocument();
  });

  it('passes correct props to AvatarWithFallback when avatar is provided', () => {
    render(<User user={mockUser} />);

    const avatar = screen.getByTestId('user-avatar');
    expect(avatar).toHaveAttribute('data-name', 'Anna Pleb');
    expect(avatar).toHaveAttribute('data-avatar-url', '/avatar1.jpg');
  });

  it('passes correct props to AvatarWithFallback when avatar is not provided', () => {
    const userWithoutAvatar = { ...mockUser, avatar: undefined };
    render(<User user={userWithoutAvatar} />);

    const avatar = screen.getByTestId('user-avatar');
    expect(avatar).toHaveAttribute('data-name', 'Anna Pleb');
    expect(avatar).not.toHaveAttribute('data-avatar-url');
  });

  it('truncates long names and handles', () => {
    const longNameUser = {
      ...mockUser,
      name: 'Very Long Name That Should Be Truncated',
      handle: 'Very Long Handle That Should Also Be Truncated',
    };
    render(<User user={longNameUser} />);

    expect(screen.getByTestId('user-name')).toHaveClass('truncate');
    expect(screen.getByTestId('user-handle')).toHaveClass('truncate');
  });

  it('truncates long names when showing counts', () => {
    const longNameUserWithCounts = {
      ...mockUser,
      name: 'Very Long Name That Should Be Truncated',
      tagsCount: 5,
      postsCount: 12,
    };
    render(<User user={longNameUserWithCounts} />);

    expect(screen.getByTestId('user-name')).toHaveClass('truncate');
    expect(screen.getByTestId('user-tags-count')).toHaveClass('truncate');
    expect(screen.getByTestId('user-posts-count')).toHaveClass('truncate');
  });
});
