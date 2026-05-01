import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchRecentItem } from './SearchRecentItem';
import { RECENT_ITEM_TYPE } from './SearchRecentItem.constants';
import type { RecentUserSearchItem, RecentTagSearchItem } from '../SearchRecentUserItem/SearchRecentUserItem.types';
import type { Pubky } from '@/models/models.types';
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

  it('returns null when type is USER but user is not provided', () => {
    const onUserClick = vi.fn();
    const { container } = render(<SearchRecentItem type={RECENT_ITEM_TYPE.USER} onUserClick={onUserClick} />);

    expect(container.firstChild).toBeNull();
  });

  it('returns null when type is TAG but tag is not provided', () => {
    const onTagClick = vi.fn();
    const { container } = render(<SearchRecentItem type={RECENT_ITEM_TYPE.TAG} onTagClick={onTagClick} />);

    expect(container.firstChild).toBeNull();
  });

  it('returns null when type is USER but onUserClick is not provided', () => {
    const { container } = render(<SearchRecentItem type={RECENT_ITEM_TYPE.USER} user={mockUser} />);

    expect(container.firstChild).toBeNull();
  });

  it('returns null when type is TAG but onTagClick is not provided', () => {
    const { container } = render(<SearchRecentItem type={RECENT_ITEM_TYPE.TAG} tag={mockTag} />);

    expect(container.firstChild).toBeNull();
  });

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
