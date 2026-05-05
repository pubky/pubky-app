import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { SearchUserSuggestion } from './SearchUserSuggestion';

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
    AvatarWithFallback: ({ name, size }: { name: string; avatarUrl?: string; size: string }) => (
      <div data-testid="avatar" data-name={name} data-size={size}>
        Avatar
      </div>
    ),
  };
});

// Use real utility implementations - formatPublicKey and truncateString are pure functions
// Pure utility functions should never be mocked per guidelines

describe('SearchUserSuggestion', () => {
  const mockUser = {
    id: 'pk:abc123def456' as Pubky,
    name: 'John Doe',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  it('renders user name', () => {
    render(<SearchUserSuggestion user={mockUser} />);

    expect(screen.getByTestId('user-name')).toHaveTextContent('John Doe');
  });

  it('renders formatted pubky', () => {
    render(<SearchUserSuggestion user={mockUser} />);

    // Real formatPublicKey implementation formats differently than mock
    // pk:abc123def456 with length 8 should format as abc1...f456
    const pubkyElement = screen.getByTestId('user-pubky');
    expect(pubkyElement).not.toHaveTextContent(/pubky/);
    expect(pubkyElement.textContent).toMatch(/[a-z0-9]+\.\.\.[a-z0-9]+/);
  });

  it('renders avatar with correct props', () => {
    render(<SearchUserSuggestion user={mockUser} />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveAttribute('data-name', 'John Doe');
    expect(avatar).toHaveAttribute('data-size', 'default');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<SearchUserSuggestion user={mockUser} onClick={onClick} />);

    fireEvent.click(screen.getByTestId(`search-user-suggestion-${mockUser.id}`));

    expect(onClick).toHaveBeenCalledWith(mockUser.id);
  });

  it('does not throw when onClick is not provided', () => {
    render(<SearchUserSuggestion user={mockUser} />);

    expect(() => {
      fireEvent.click(screen.getByTestId(`search-user-suggestion-${mockUser.id}`));
    }).not.toThrow();
  });

  it('renders user without avatar url', () => {
    const userWithoutAvatar = {
      id: 'pk:xyz789' as Pubky,
      name: 'Jane Doe',
    };

    render(<SearchUserSuggestion user={userWithoutAvatar} />);

    expect(screen.getByTestId('user-name')).toHaveTextContent('Jane Doe');
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('has correct aria-label and role', () => {
    render(<SearchUserSuggestion user={mockUser} />);

    const suggestion = screen.getByTestId(`search-user-suggestion-${mockUser.id}`);
    expect(suggestion).toHaveAttribute('aria-label');
    const ariaLabel = suggestion.getAttribute('aria-label');
    expect(ariaLabel).toContain('John Doe');
    // Real formatPublicKey formats as abc1...f456 (length 8)
    expect(ariaLabel).toMatch(/[a-z0-9]+\.\.\.[a-z0-9]+/);
  });

  describe('SearchUserSuggestion - Snapshots', () => {
    it('matches snapshot with full user data', () => {
      const { container } = render(<SearchUserSuggestion user={mockUser} onClick={vi.fn()} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot without avatar', () => {
      const userWithoutAvatar = {
        id: 'pk:xyz789' as Pubky,
        name: 'Jane Doe',
      };
      const { container } = render(<SearchUserSuggestion user={userWithoutAvatar} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
