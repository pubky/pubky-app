import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { SearchRecentUserItem } from './SearchRecentUserItem';

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      onClick,
      ...props
    }: React.PropsWithChildren<{ className?: string; onClick?: () => void }>) => (
      <div className={className} onClick={onClick} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
      as: Component = 'span',
      ...props
    }: React.PropsWithChildren<{ className?: string; as?: React.ElementType }>) => (
      <Component className={className} {...props}>
        {children}
      </Component>
    ),
  };
});

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({ name, avatarUrl, size }: { name: string; avatarUrl?: string; size: string }) => (
      <div data-testid="avatar" data-name={name} data-avatar-url={avatarUrl || ''} data-size={size}>
        Avatar
      </div>
    ),
  };
});

// Use real utility implementations - formatPublicKey and truncateString are pure functions
// Pure utility functions should never be mocked per guidelines

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: (userId: string) => ({
    userDetails: {
      id: userId,
      name: 'Test User',
      image: 'test-image.jpg',
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: () => 'https://example.com/avatar.jpg',
}));

describe('SearchRecentUserItem', () => {
  const mockPubky = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
  const mockUser = {
    id: mockPubky as Pubky,
    searchedAt: Date.now(),
  };

  it('renders user name from userDetails', () => {
    render(<SearchRecentUserItem user={mockUser} onClick={vi.fn()} />);

    expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
  });

  it('renders formatted pubky', () => {
    render(<SearchRecentUserItem user={mockUser} onClick={vi.fn()} />);

    // Real formatPublicKey implementation formats differently than mock
    // 52-char z32 with length 8 should format as abcd...mnop
    const pubkyElement = screen.getByTestId('user-pubky');
    expect(pubkyElement).toHaveTextContent('abcd...mnop');
  });

  it('renders avatar with avatar url', () => {
    render(<SearchRecentUserItem user={mockUser} onClick={vi.fn()} />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/avatar.jpg');
    expect(avatar).toHaveAttribute('data-name', 'Test User');
  });

  it('calls onClick with user id when clicked', () => {
    const onClick = vi.fn();
    render(<SearchRecentUserItem user={mockUser} onClick={onClick} />);

    fireEvent.click(screen.getByTestId(`recent-user-${mockUser.id}`));

    expect(onClick).toHaveBeenCalledWith(mockUser.id);
  });

  it('has correct aria-label', () => {
    render(<SearchRecentUserItem user={mockUser} onClick={vi.fn()} />);

    const item = screen.getByTestId(`recent-user-${mockUser.id}`);
    expect(item).toHaveAttribute('role', 'button');
    expect(item).toHaveAttribute('aria-label');
    expect(item.getAttribute('aria-label')).toContain('Test User');
  });

  describe('SearchRecentUserItem - Snapshots', () => {
    it('matches snapshot', () => {
      const { container } = render(<SearchRecentUserItem user={mockUser} onClick={vi.fn()} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
