import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_PEOPLE_PREVIEW_COUNT } from '@/config/search';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchPeople } from '@/hooks/useSearchPeople/useSearchPeople';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import type { UserListItemData } from '@/organisms/UserListItem/UserListItem.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { SearchPeople } from './SearchPeople';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({
  useSearchCriteria: vi.fn(),
}));

vi.mock('@/hooks/useSearchPeople/useSearchPeople', () => ({
  useSearchPeople: vi.fn(),
}));

vi.mock('@/molecules/Toaster/toast');

const mockToggleFollow = vi.fn();
vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: mockToggleFollow,
    isUserLoading: () => false,
  }),
}));

const CURRENT_USER = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: CURRENT_USER }),
}));

vi.mock('@/organisms/UserListItem/UserListItem', () => ({
  UserListItem: ({
    user,
    variant,
    isCurrentUser,
    onFollowClick,
  }: {
    user: UserListItemData;
    variant: string;
    isCurrentUser?: boolean;
    onFollowClick?: (id: Pubky, isFollowing: boolean, name: string) => void;
  }) => (
    <div
      data-testid="user-list-item"
      data-user-id={user.id}
      data-variant={variant}
      data-is-current-user={String(isCurrentUser ?? false)}
      onClick={() => onFollowClick?.(user.id, user.isFollowing ?? false, user.name ?? '')}
    />
  ),
}));

vi.mock('@/organisms/SearchPeople/SearchPeople.skeleton', () => ({
  SearchPersonCardSkeleton: () => <div data-testid="search-person-card-skeleton" />,
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const mockUseSearchCriteria = vi.mocked(useSearchCriteria);
const tagsCriteria = (tags: string[]) => ({ mode: 'tags' as const, tags });
const mockUseSearchPeople = vi.mocked(useSearchPeople);

function buildUsers(count: number): UserListItemData[] {
  return Array.from({ length: count }, (_, index) => ({
    id: asOpaque<Pubky>(`user${index}8ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy`),
    name: `User ${index}`,
    avatarUrl: null,
    stats: { tags: index, posts: index },
    isFollowing: false,
  }));
}

const defaultPeople = {
  users: [] as UserListItemData[],
  loading: false,
  loadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
};

function setup({ people = {} }: { people?: Partial<typeof defaultPeople> } = {}) {
  mockUseSearchCriteria.mockReturnValue(tagsCriteria(['synonym']));
  mockUseSearchPeople.mockReturnValue({ ...defaultPeople, ...people });
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchPeople', () => {
  it('renders nothing without a tag search', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });

    const { container } = render(<SearchPeople />);

    expect(container.firstChild).toBeNull();
    expect(mockUseSearchPeople).not.toHaveBeenCalled();
  });

  it('renders nothing for a full-text query, which has no tags to match', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'bitcoin wallet' });

    const { container } = render(<SearchPeople />);

    expect(container.firstChild).toBeNull();
    expect(mockUseSearchPeople).not.toHaveBeenCalled();
  });

  it('renders the heading and preview-count skeletons while loading with no data', () => {
    setup({ people: { loading: true } });

    render(<SearchPeople />);

    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(screen.getAllByTestId('search-person-card-skeleton')).toHaveLength(SEARCH_PEOPLE_PREVIEW_COUNT);
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('renders nothing when the search settles empty and is exhausted', () => {
    setup({ people: { users: [], loading: false, hasMore: false } });

    const { container } = render(<SearchPeople />);

    expect(container.firstChild).toBeNull();
  });

  it('keeps a Show more path when a fully-filtered page settles empty with more on the server', () => {
    const loadMore = vi.fn();
    setup({ people: { users: [], loading: false, hasMore: true, loadMore } });

    render(<SearchPeople />);

    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('caps the collapsed preview at the preview count and shows the See all pill', () => {
    setup({ people: { users: buildUsers(6) } });

    render(<SearchPeople />);

    const cards = screen.getAllByTestId('user-list-item');
    expect(cards).toHaveLength(SEARCH_PEOPLE_PREVIEW_COUNT);
    expect(cards[0]).toHaveAttribute('data-variant', 'card');
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('hides the See all pill when everything already fits the preview', () => {
    setup({ people: { users: buildUsers(3), hasMore: false } });

    render(<SearchPeople />);

    expect(screen.getAllByTestId('user-list-item')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('expands to all fetched cards and hides the pill after See all', () => {
    setup({ people: { users: buildUsers(6) } });

    render(<SearchPeople />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.getAllByTestId('user-list-item')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('shows Show more when expanded with more on the server, and forwards clicks to loadMore', () => {
    const loadMore = vi.fn();
    setup({ people: { users: buildUsers(6), hasMore: true, loadMore } });

    render(<SearchPeople />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('disables Show more while loading more', () => {
    setup({ people: { users: buildUsers(6), hasMore: true, loadingMore: true } });

    render(<SearchPeople />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.getByRole('button', { name: 'Show more' })).toBeDisabled();
  });

  it('marks the viewer own card as current user', () => {
    const users = buildUsers(2);
    users[0] = { ...users[0], id: asOpaque<Pubky>(CURRENT_USER) };
    setup({ people: { users } });

    render(<SearchPeople />);

    const cards = screen.getAllByTestId('user-list-item');
    expect(cards[0]).toHaveAttribute('data-is-current-user', 'true');
    expect(cards[1]).toHaveAttribute('data-is-current-user', 'false');
  });

  it('forwards follow clicks to toggleFollow', () => {
    const users = buildUsers(1);
    setup({ people: { users } });

    render(<SearchPeople />);
    fireEvent.click(screen.getByTestId('user-list-item'));

    expect(mockToggleFollow).toHaveBeenCalledWith(users[0].id, false, 'User 0');
  });

  it('fires the error toast through the onError wiring', () => {
    setup({ people: { users: buildUsers(1) } });

    render(<SearchPeople />);

    const options = mockUseSearchPeople.mock.calls[0][1];
    options?.onError?.(new Error('boom'));

    expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('collapses back to the preview when the tags change (remount)', () => {
    setup({ people: { users: buildUsers(6) } });

    const { rerender } = render(<SearchPeople />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(screen.getAllByTestId('user-list-item')).toHaveLength(6);

    mockUseSearchCriteria.mockReturnValue(tagsCriteria(['bitcoin']));
    rerender(<SearchPeople />);

    expect(screen.getAllByTestId('user-list-item')).toHaveLength(SEARCH_PEOPLE_PREVIEW_COUNT);
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });
});

describe('SearchPeople - Snapshots', () => {
  it('matches snapshot in the collapsed preview state', () => {
    setup({ people: { users: buildUsers(6) } });
    const { container } = render(<SearchPeople />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot while loading', () => {
    setup({ people: { loading: true } });
    const { container } = render(<SearchPeople />);
    expect(container).toMatchSnapshot();
  });
});
