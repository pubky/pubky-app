import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { SearchRecentSection } from './SearchRecentSection';

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
      query,
      onUserClick,
      onTagClick,
      onQueryClick,
    }: {
      type: string;
      user?: { id: string };
      tag?: { tag: string };
      query?: { query: string };
      onUserClick?: (userId: string) => void;
      onTagClick?: (tagName: string) => void;
      onQueryClick?: (query: string) => void;
    }) => {
      const testId =
        type === 'user'
          ? `user-item-${user?.id}`
          : type === 'tag'
            ? `tag-item-${tag?.tag}`
            : `recent-query-${query?.query}`;
      return (
        <div
          data-testid={testId}
          onClick={() => {
            if (type === 'user' && user && onUserClick) onUserClick(user.id);
            if (type === 'tag' && tag && onTagClick) onTagClick(tag.tag);
            if (type === 'query' && query && onQueryClick) onQueryClick(query.query);
          }}
        >
          {type === 'user' ? `User: ${user?.id}` : type === 'tag' ? `Tag: ${tag?.tag}` : `Query: ${query?.query}`}
        </div>
      );
    },
  };
});

vi.mock('@/molecules/SearchRecentItem/SearchRecentItem.constants', () => {
  return {
    RECENT_ITEM_TYPE: {
      USER: 'user',
      TAG: 'tag',
      QUERY: 'query',
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

  const mockQueries = [
    { query: 'bitcoin wallets', searchedAt: Date.now() },
    { query: 'nostr', searchedAt: Date.now() },
  ];

  it('renders "Recent searches" header', () => {
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Recent searches')).toBeInTheDocument();
  });

  it('renders all users', () => {
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={[]}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('user-item-pk:user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-item-pk:user2')).toBeInTheDocument();
  });

  it('renders all tags', () => {
    render(
      <SearchRecentSection
        users={[]}
        tags={mockTags}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tag-item-tech')).toBeInTheDocument();
    expect(screen.getByTestId('tag-item-news')).toBeInTheDocument();
  });

  it('renders all query chips when queries are present', () => {
    render(
      <SearchRecentSection
        users={[]}
        tags={[]}
        queries={mockQueries}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('recent-query-bitcoin wallets')).toBeInTheDocument();
    expect(screen.getByTestId('recent-query-nostr')).toBeInTheDocument();
  });

  it('interleaves tag and query chips in one row sorted by recency', () => {
    render(
      <SearchRecentSection
        users={[]}
        tags={[
          { tag: 'oldest-tag', searchedAt: 1 },
          { tag: 'newest-tag', searchedAt: 4 },
        ]}
        queries={[
          { query: 'old query', searchedAt: 2 },
          { query: 'new query', searchedAt: 3 },
        ]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    const chipTexts = screen.getAllByTestId(/^(tag-item-|recent-query-)/).map((element) => element.textContent);
    expect(chipTexts).toEqual(['Tag: newest-tag', 'Query: new query', 'Query: old query', 'Tag: oldest-tag']);
  });

  it('caps the merged tag+query row at MAX_RECENT_SEARCHES, keeping the most recent', () => {
    // 5 tags + 5 queries, each list at its own cap — the merged row must not
    // double to 10 chips (#1840 dropdown height).
    render(
      <SearchRecentSection
        users={[]}
        tags={[1, 3, 5, 7, 9].map((searchedAt) => ({ tag: `tag-${searchedAt}`, searchedAt }))}
        queries={[2, 4, 6, 8, 10].map((searchedAt) => ({ query: `query ${searchedAt}`, searchedAt }))}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    const chipTexts = screen.getAllByTestId(/^(tag-item-|recent-query-)/).map((element) => element.textContent);
    expect(chipTexts).toEqual(['Query: query 10', 'Tag: tag-9', 'Query: query 8', 'Tag: tag-7', 'Query: query 6']);
  });

  it('renders the section when only queries are non-empty', () => {
    render(
      <SearchRecentSection
        users={[]}
        tags={[]}
        queries={mockQueries}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Recent searches')).toBeInTheDocument();
  });

  it('returns null when users, tags, and queries are all empty', () => {
    const { container } = render(
      <SearchRecentSection
        users={[]}
        tags={[]}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders clear button when onClearAll is provided', () => {
    const { container } = render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getByTestId('clear-all-button')).toBeInTheDocument();
    // Real icon implementation renders as SVG with lucide-x class
    const svg = container.querySelector('svg.lucide-x');
    expect(svg).toBeInTheDocument();
  });

  it('does not render clear button when onClearAll is not provided', () => {
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('clear-all-button')).not.toBeInTheDocument();
  });

  it('calls onClearAll when clear button is clicked', () => {
    const onClearAll = vi.fn();
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={mockTags}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
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
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    const clearButton = screen.getByTestId('clear-all-button');
    expect(clearButton).toHaveAttribute('aria-label', 'Clear all recent searches');
  });

  it('calls onUserClick when user item is clicked', () => {
    const onUserClick = vi.fn();
    render(
      <SearchRecentSection
        users={mockUsers}
        tags={[]}
        queries={[]}
        onUserClick={onUserClick}
        onTagClick={vi.fn()}
        onQueryClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('user-item-pk:user1'));

    expect(onUserClick).toHaveBeenCalledWith(mockUsers[0].id);
  });

  it('calls onTagClick when tag item is clicked', () => {
    const onTagClick = vi.fn();
    render(
      <SearchRecentSection
        users={[]}
        tags={mockTags}
        queries={[]}
        onUserClick={vi.fn()}
        onTagClick={onTagClick}
        onQueryClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tag-item-tech'));

    expect(onTagClick).toHaveBeenCalledWith(mockTags[0].tag);
  });

  it('calls onQueryClick with the query string when a query chip is clicked', () => {
    const onQueryClick = vi.fn();
    render(
      <SearchRecentSection
        users={[]}
        tags={[]}
        queries={mockQueries}
        onUserClick={vi.fn()}
        onTagClick={vi.fn()}
        onQueryClick={onQueryClick}
      />,
    );

    fireEvent.click(screen.getByTestId('recent-query-bitcoin wallets'));

    expect(onQueryClick).toHaveBeenCalledWith(mockQueries[0].query);
  });

  describe('SearchRecentSection - Snapshots', () => {
    it('matches snapshot with users and tags', () => {
      const { container } = render(
        <SearchRecentSection
          users={mockUsers}
          tags={mockTags}
          queries={[]}
          onUserClick={vi.fn()}
          onTagClick={vi.fn()}
          onQueryClick={vi.fn()}
          onClearAll={vi.fn()}
        />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with only users', () => {
      const { container } = render(
        <SearchRecentSection
          users={mockUsers}
          tags={[]}
          queries={[]}
          onUserClick={vi.fn()}
          onTagClick={vi.fn()}
          onQueryClick={vi.fn()}
        />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with only tags', () => {
      const { container } = render(
        <SearchRecentSection
          users={[]}
          tags={mockTags}
          queries={[]}
          onUserClick={vi.fn()}
          onTagClick={vi.fn()}
          onQueryClick={vi.fn()}
        />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
