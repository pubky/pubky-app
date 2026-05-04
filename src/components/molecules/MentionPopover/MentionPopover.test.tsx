import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MentionPopover } from './MentionPopover';
import type { Pubky } from '@/models/models.types';
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      onMouseEnter,
      ...props
    }: React.PropsWithChildren<{ className?: string; onMouseEnter?: () => void }>) => (
      <div className={className} onMouseEnter={onMouseEnter} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: ({ size }: { size: string }) => <div data-testid="spinner" data-size={size} />,
  };
});

vi.mock('@/molecules/SearchUserSuggestion/SearchUserSuggestion', () => {
  return {
    SearchUserSuggestion: ({
      user,
      onClick,
    }: {
      user: { id: string; name: string };
      onClick?: (id: string) => void;
    }) => (
      <div data-testid={`user-suggestion-${user.id}`} onClick={() => onClick?.(user.id)}>
        {user.name}
      </div>
    ),
  };
});

describe('MentionPopover', () => {
  const mockUsers = [
    { id: 'user1' as Pubky, name: 'John Doe', avatarUrl: 'https://example.com/avatar1.jpg' },
    { id: 'user2' as Pubky, name: 'Jane Smith', avatarUrl: 'https://example.com/avatar2.jpg' },
    { id: 'user3' as Pubky, name: 'Bob Wilson' },
  ];

  const defaultProps = {
    users: mockUsers,
    selectedIndex: null,
    onSelect: vi.fn(),
    onHover: vi.fn(),
  };

  it('renders nothing when users array is empty', () => {
    const { container } = render(<MentionPopover {...defaultProps} users={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders all users', () => {
    render(<MentionPopover {...defaultProps} />);

    expect(screen.getByTestId('user-suggestion-user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-suggestion-user2')).toBeInTheDocument();
    expect(screen.getByTestId('user-suggestion-user3')).toBeInTheDocument();
  });

  it('calls onSelect when a user is clicked', () => {
    const onSelect = vi.fn();
    render(<MentionPopover {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('user-suggestion-user1'));

    expect(onSelect).toHaveBeenCalledWith('user1');
  });

  it('calls onHover when hovering over a user', () => {
    const onHover = vi.fn();
    render(<MentionPopover {...defaultProps} onHover={onHover} />);

    fireEvent.mouseEnter(screen.getByTestId('mention-popover-item-0'));

    expect(onHover).toHaveBeenCalledWith(0);
  });

  it('applies selected style to selected index', () => {
    render(<MentionPopover {...defaultProps} selectedIndex={1} />);

    const selectedItem = screen.getByTestId('mention-popover-item-1');
    expect(selectedItem.className).toContain('bg-accent');
  });

  it('has correct testid on container', () => {
    render(<MentionPopover {...defaultProps} />);

    expect(screen.getByTestId('mention-popover')).toBeInTheDocument();
  });

  describe('MentionPopover - Snapshots', () => {
    it('matches snapshot with users', () => {
      const { container } = render(<MentionPopover {...defaultProps} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with selected index', () => {
      const { container } = render(<MentionPopover {...defaultProps} selectedIndex={0} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with empty users', () => {
      const { container } = render(<MentionPopover {...defaultProps} users={[]} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
