import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchRecentSection } from './SearchRecentSection';
import type { Pubky } from '@/models/models.types';
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      className,
      onClick,
      ...props
    }: React.PropsWithChildren<{ className?: string; onClick?: () => void }>) => (
      <button className={className} onClick={onClick} {...props}>
        {children}
      </button>
    ),
  };
});

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
      size,
      ...props
    }: React.PropsWithChildren<{ className?: string; size?: string }>) => (
      <span className={className} data-size={size} {...props}>
        {children}
      </span>
    ),
  };
});

vi.mock('@/molecules/SearchRecentItem/SearchRecentItem', () => {
  return {
    SearchRecentItem: ({
      type,
      user,
      tag,
      onUserClick,
      onTagClick,
    }: {
      type: string;
      user?: { id: string };
      tag?: { tag: string };
      onUserClick?: (userId: string) => void;
      onTagClick?: (tagName: string) => void;
    }) => (
      <div
        data-testid={type === 'user' ? `user-item-${user?.id}` : `tag-item-${tag?.tag}`}
        onClick={() => {
          if (type === 'user' && user && onUserClick) onUserClick(user.id);
          if (type === 'tag' && tag && onTagClick) onTagClick(tag.tag);
        }}
      >
        {type === 'user' ? `User: ${user?.id}` : `Tag: ${tag?.tag}`}
      </div>
    ),
  };
});

vi.mock('@/molecules/SearchRecentItem/SearchRecentItem.constants', () => {
  return {
    RECENT_ITEM_TYPE: {
      USER: 'user',
      TAG: 'tag',
    },
  };
});

// Use real icon implementations - icons should never be mocked per guidelines

describe('SearchRecentSection', () => {
  const mockUsers = [
    { id: 'pk:user1' as Pubky, searchedAt: Date.now() },
    { id: 'pk:user2' as Pubky, searchedAt: Date.now() },
  ];

  const mockTags = [
    { tag: 'tech', searchedAt: Date.now() },
    { tag: 'news', searchedAt: Date.now() },
  ];

  it('renders "Recent searches" header', () => {
    render(<SearchRecentSection users={mockUsers} tags={mockTags} onUserClick={vi.fn()} onTagClick={vi.fn()} />);

    expect(screen.getByText('Recent searches')).toBeInTheDocument();
  });

  it('renders all users', () => {
    render(<SearchRecentSection users={mockUsers} tags={[]} onUserClick={vi.fn()} onTagClick={vi.fn()} />);

    expect(screen.getByTestId('user-item-pk:user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-item-pk:user2')).toBeInTheDocument();
  });

  it('renders all tags', () => {
    render(<SearchRecentSection users={[]} tags={mockTags} onUserClick={vi.fn()} onTagClick={vi.fn()} />);

    expect(screen.getByTestId('tag-item-tech')).toBeInTheDocument();
    expect(screen.getByTestId('tag-item-news')).toBeInTheDocument();
  });

  it('returns null when both users and tags are empty', () => {
    const { container } = render(
      <SearchRecentSection users={[]} tags={[]} onUserClick={vi.fn()} onTagClick={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders clear button when onClearAll is provided', () => {
    const { container } = render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getByTestId('clear-all-button')).toBeInTheDocument();
    // Real icon implementation renders as SVG with lucide-x class
    const svg = container.querySelector('svg.lucide-x');
    expect(svg).toBeInTheDocument();
  });

  it('does not render clear button when onClearAll is not provided', () => {
    render(<SearchRecentSection users={mockUsers} tags={mockTags} onUserClick={vi.fn()} onTagClick={vi.fn()} />);

    expect(screen.queryByTestId('clear-all-button')).not.toBeInTheDocument();
  });

  it('calls onClearAll when clear button is clicked', () => {
    const onClearAll = vi.fn();
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onClearAll={onClearAll}
      />,
    );

    fireEvent.click(screen.getByTestId('clear-all-button'));

    expect(onClearAll).toHaveBeenCalled();
  });

  it('clear button has correct aria-label', () => {
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    const clearButton = screen.getByTestId('clear-all-button');
    expect(clearButton).toHaveAttribute('aria-label', 'Clear all recent searches');
  });

  it('calls onUserClick when user item is clicked', () => {
    const onUserClick = vi.fn();
    render(<SearchRecentSection users={mockUsers} tags={[]} onUserClick={onUserClick} onTagClick={vi.fn()} />);

    fireEvent.click(screen.getByTestId('user-item-pk:user1'));

    expect(onUserClick).toHaveBeenCalledWith(mockUsers[0].id);
  });

  it('calls onTagClick when tag item is clicked', () => {
    const onTagClick = vi.fn();
    render(<SearchRecentSection users={[]} tags={mockTags} onUserClick={vi.fn()} onTagClick={onTagClick} />);

    fireEvent.click(screen.getByTestId('tag-item-tech'));

    expect(onTagClick).toHaveBeenCalledWith(mockTags[0].tag);
  });

  describe('SearchRecentSection - Snapshots', () => {
    it('matches snapshot with users and tags', () => {
      const { container } = render(
        <SearchRecentSection
          users={mockUsers}
          tags={mockTags}
          onUserClick={vi.fn()}
          onTagClick={vi.fn()}
          onClearAll={vi.fn()}
        />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with only users', () => {
      const { container } = render(
        <SearchRecentSection users={mockUsers} tags={[]} onUserClick={vi.fn()} onTagClick={vi.fn()} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with only tags', () => {
      const { container } = render(
        <SearchRecentSection users={[]} tags={mockTags} onUserClick={vi.fn()} onTagClick={vi.fn()} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
