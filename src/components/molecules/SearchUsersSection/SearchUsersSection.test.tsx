import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchUsersSection } from './SearchUsersSection';
import type { Pubky } from '@/models/models.types';
vi.mock('@/atoms', () => ({
  Container: ({ children, className, ...props }: React.PropsWithChildren<{ className?: string }>) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    className,
    size,
    ...props
  }: React.PropsWithChildren<{ className?: string; size?: string }>) => (
    <span className={className} data-size={size} {...props}>
      {children}
    </span>
  ),
}));

vi.mock('@/molecules', () => ({
  SearchUserSuggestion: ({ user, onClick }: { user: { id: string; name: string }; onClick?: (id: string) => void }) => (
    <div data-testid={`user-${user.id}`} onClick={() => onClick?.(user.id)}>
      {user.name}
    </div>
  ),
}));

describe('SearchUsersSection', () => {
  const mockUsers = [
    { id: 'pk:user1' as Pubky, name: 'User One' },
    { id: 'pk:user2' as Pubky, name: 'User Two' },
  ];

  it('renders title', () => {
    render(<SearchUsersSection title="Users" users={mockUsers} onUserClick={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('renders all users', () => {
    render(<SearchUsersSection title="Users" users={mockUsers} onUserClick={vi.fn()} />);

    expect(screen.getByTestId('user-pk:user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-pk:user2')).toBeInTheDocument();
  });

  it('returns null when users array is empty', () => {
    const { container } = render(<SearchUsersSection title="Users" users={[]} onUserClick={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('passes onUserClick to SearchUserSuggestion', () => {
    const onUserClick = vi.fn();
    render(<SearchUsersSection title="Users" users={mockUsers} onUserClick={onUserClick} />);

    screen.getByTestId('user-pk:user1').click();

    expect(onUserClick).toHaveBeenCalledWith('pk:user1');
  });

  it('renders section with accessible structure', () => {
    render(<SearchUsersSection title="Users" users={mockUsers} onUserClick={vi.fn()} />);

    // Section should have title visible
    expect(screen.getByText('Users')).toBeInTheDocument();
    // Users should be rendered
    expect(screen.getByTestId('user-pk:user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-pk:user2')).toBeInTheDocument();
  });

  describe('SearchUsersSection - Snapshots', () => {
    it('matches snapshot with users', () => {
      const { container } = render(<SearchUsersSection title="Users" users={mockUsers} onUserClick={vi.fn()} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with empty users', () => {
      const { container } = render(<SearchUsersSection title="Users" users={[]} onUserClick={vi.fn()} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
