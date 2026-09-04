import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import type {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';
import { SearchRecentItem } from './SearchRecentItem';
import { RECENT_ITEM_TYPE } from './SearchRecentItem.constants';

vi.mock('@/molecules/PostTag/PostTag', () => {
  return {
    PostTag: ({ label, onClick, ...props }: { label: string; onClick?: () => void }) => (
      <button onClick={onClick} {...props}>
        {label}
      </button>
    ),
  };
});

vi.mock('@/molecules/SearchRecentUserItem/SearchRecentUserItem', () => {
  return {
    SearchRecentUserItem: ({
      user,
      onClick,
    }: {
      user: RecentUserSearchItem;
      onClick: (user: RecentUserSearchItem) => void;
    }) => (
      <div data-testid={`user-item-${user.id}`} onClick={() => onClick(user)}>
        User Item
      </div>
    ),
  };
});

describe('SearchRecentItem', () => {
  const mockUser: RecentUserSearchItem = {
    id: 'pk:user123' as Pubky,
    searchedAt: Date.now(),
  };

  const mockTag: RecentTagSearchItem = {
    tag: 'technology',
    searchedAt: Date.now(),
  };

  const mockQuery: RecentQuerySearchItem = {
    query: 'bitcoin wallets',
    searchedAt: Date.now(),
  };

  it('renders user item when type is USER and onUserClick provided', () => {
    const onUserClick = vi.fn();
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.USER} user={mockUser} onUserClick={onUserClick} />);

    expect(screen.getByTestId(`user-item-${mockUser.id}`)).toBeInTheDocument();
  });

  it('renders tag item when type is TAG and onTagClick provided', () => {
    const onTagClick = vi.fn();
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.TAG} tag={mockTag} onTagClick={onTagClick} />);

    expect(screen.getByTestId(`recent-tag-${mockTag.tag}`)).toBeInTheDocument();
    expect(screen.getByText('technology')).toBeInTheDocument();
  });

  it('renders query item when type is QUERY and onQueryClick provided', () => {
    const onQueryClick = vi.fn();
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.QUERY} query={mockQuery} onQueryClick={onQueryClick} />);

    expect(screen.getByTestId(`recent-query-${mockQuery.query}`)).toBeInTheDocument();
    expect(screen.getByText('bitcoin wallets')).toBeInTheDocument();
  });

  it('query chip keeps the base focus-visible ring and never submits an enclosing form', () => {
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.QUERY} query={mockQuery} onQueryClick={vi.fn()} />);

    const chip = screen.getByTestId(`recent-query-${mockQuery.query}`);
    // Buttons default to type="submit" inside a <form>.
    expect(chip).toHaveAttribute('type', 'button');
    // The base Button class carries the focus ring; `overrideDefaults` would drop it.
    expect(chip.className).toContain('focus-visible:ring-ring/50');
  });

  it('calls onUserClick with user when user item is clicked', () => {
    const onUserClick = vi.fn();
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.USER} user={mockUser} onUserClick={onUserClick} />);

    fireEvent.click(screen.getByTestId(`user-item-${mockUser.id}`));

    expect(onUserClick).toHaveBeenCalledWith(mockUser);
  });

  it('calls onTagClick with tag string when tag item is clicked', () => {
    const onTagClick = vi.fn();
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.TAG} tag={mockTag} onTagClick={onTagClick} />);

    fireEvent.click(screen.getByTestId(`recent-tag-${mockTag.tag}`));

    expect(onTagClick).toHaveBeenCalledWith(mockTag.tag);
  });

  it('calls onQueryClick with query string when query item is clicked', () => {
    const onQueryClick = vi.fn();
    render(<SearchRecentItem type={RECENT_ITEM_TYPE.QUERY} query={mockQuery} onQueryClick={onQueryClick} />);

    fireEvent.click(screen.getByTestId(`recent-query-${mockQuery.query}`));

    expect(onQueryClick).toHaveBeenCalledWith(mockQuery.query);
  });

  // Invalid type/data combos (e.g. USER without user data) are compile errors
  // now that the props are a discriminated union, so no runtime tests for them.

  describe('SearchRecentItem - Snapshots', () => {
    it('matches snapshot for user type', () => {
      const { container } = render(
        <SearchRecentItem type={RECENT_ITEM_TYPE.USER} user={mockUser} onUserClick={vi.fn()} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot for tag type', () => {
      const { container } = render(<SearchRecentItem type={RECENT_ITEM_TYPE.TAG} tag={mockTag} onTagClick={vi.fn()} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
