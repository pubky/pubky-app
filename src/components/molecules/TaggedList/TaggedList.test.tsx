import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import type { TaggedItemProps, TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { TaggedList } from './TaggedList';

const { mockLoadTaggers, mockLoadMoreTaggers, mockUseEntityTaggers, mockTaggerStates } = vi.hoisted(() => {
  const loadTaggers = vi.fn();
  const loadMoreTaggers = vi.fn();
  const taggerStates = new Map<
    string,
    { ids: string[]; skip: number; isLoading: boolean; hasMore: boolean; hasFetched: boolean }
  >();
  return {
    mockLoadTaggers: loadTaggers,
    mockLoadMoreTaggers: loadMoreTaggers,
    mockTaggerStates: taggerStates,
    mockUseEntityTaggers: vi.fn(() => ({
      taggersByLabel: new Map<string, string[]>(),
      taggerStates,
      loadTaggers,
      loadMoreTaggers,
    })),
  };
});

vi.mock('@/hooks/useEntityTaggers/useEntityTaggers', () => ({
  useEntityTaggers: mockUseEntityTaggers,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'viewer' }),
}));

// Mock TaggedItem
vi.mock('@/molecules/TaggedItem/TaggedItem', () => {
  return {
    TaggedItem: ({
      tag,
      onExpandToggle,
      expandedTaggerIds,
      isLoadingTaggers,
      isLoadingMoreTaggers,
      hasMoreTaggers,
      onLoadMoreTaggers,
    }: TaggedItemProps) => (
      <div
        data-testid="tagged-item"
        data-expanded-ids={expandedTaggerIds?.join(',')}
        data-loading={isLoadingTaggers}
        data-loading-more={isLoadingMoreTaggers}
        data-has-more={hasMoreTaggers}
        onClick={() => onExpandToggle?.(tag.label)}
      >
        {tag.label}
        <button data-testid={`load-more-${tag.label}`} onClick={onLoadMoreTaggers}>
          more
        </button>
      </div>
    ),
  };
});

const mockTags: TagWithAvatars[] = [
  {
    label: 'bitcoin',
    taggers: [
      { id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1' },
      { id: 'user2', avatarUrl: 'https://cdn.example.com/avatar/user2' },
    ],
    taggers_count: 2,
    relationship: false,
  },
  {
    label: 'satoshi',
    taggers: [{ id: 'user3', avatarUrl: 'https://cdn.example.com/avatar/user3' }],
    taggers_count: 1,
    relationship: false,
  },
];

const mockOnTagToggle = vi.fn();

describe('TaggedList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaggerStates.clear();
  });

  it('renders all tags', () => {
    render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('satoshi')).toBeInTheDocument();
  });

  it('renders empty list when no tags', () => {
    const { container } = render(<TaggedList tags={[]} onTagToggle={mockOnTagToggle} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.queryByTestId('tagged-item')).not.toBeInTheDocument();
  });

  it('renders correct number of items', () => {
    render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);
    const items = screen.getAllByTestId('tagged-item');
    expect(items).toHaveLength(2);
  });

  it('loads profile taggers when a profile tag expands', async () => {
    render(
      <TaggedList tags={mockTags} taggedId="profile-pubky" taggedKind={TagKind.USER} onTagToggle={mockOnTagToggle} />,
    );

    fireEvent.click(screen.getByText('bitcoin'));

    await waitFor(() => {
      expect(mockUseEntityTaggers).toHaveBeenCalledWith('profile-pubky', TagKind.USER);
      expect(mockLoadTaggers).toHaveBeenCalledWith('bitcoin', 2);
    });
  });

  it('does not load taggers without an entity', async () => {
    render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);

    fireEvent.click(screen.getByText('bitcoin'));

    await waitFor(() => {
      expect(screen.getByText('bitcoin')).toHaveAttribute('data-expanded-ids', 'user1,user2');
    });
    expect(mockLoadTaggers).not.toHaveBeenCalled();
  });

  it('re-syncs the expanded tag when its count changes', async () => {
    const { rerender } = render(
      <TaggedList tags={mockTags} taggedId="profile-pubky" taggedKind={TagKind.USER} onTagToggle={mockOnTagToggle} />,
    );
    fireEvent.click(screen.getByText('bitcoin'));
    await waitFor(() => expect(mockLoadTaggers).toHaveBeenCalledWith('bitcoin', 2));

    const toggledTags = [{ ...mockTags[0], taggers_count: 3, relationship: true }, mockTags[1]];
    rerender(
      <TaggedList
        tags={toggledTags}
        taggedId="profile-pubky"
        taggedKind={TagKind.USER}
        onTagToggle={mockOnTagToggle}
      />,
    );

    await waitFor(() => expect(mockLoadTaggers).toHaveBeenCalledWith('bitcoin', 3));
  });

  it('merges fetched taggers with the preview and the viewer relationship', () => {
    mockTaggerStates.set('bitcoin', {
      ids: ['user1', 'user2', 'user9', 'viewer'],
      skip: 4,
      isLoading: false,
      hasMore: true,
      hasFetched: true,
    });
    const toggledTags = [{ ...mockTags[0], taggers: mockTags[0].taggers, relationship: false }, mockTags[1]];

    render(
      <TaggedList
        tags={toggledTags}
        taggedId="profile-pubky"
        taggedKind={TagKind.USER}
        onTagToggle={mockOnTagToggle}
      />,
    );
    fireEvent.click(screen.getByText('bitcoin'));

    const item = screen.getByText('bitcoin');
    expect(item).toHaveAttribute('data-expanded-ids', 'user1,user2,user9');
    expect(item).toHaveAttribute('data-has-more', 'true');
    expect(screen.getByText('satoshi')).not.toHaveAttribute('data-expanded-ids');
  });

  it('distinguishes the initial load from loading more', () => {
    mockTaggerStates.set('bitcoin', { ids: [], skip: 0, isLoading: true, hasMore: true, hasFetched: false });
    mockTaggerStates.set('satoshi', { ids: ['user3'], skip: 1, isLoading: true, hasMore: true, hasFetched: true });

    render(
      <TaggedList tags={mockTags} taggedId="profile-pubky" taggedKind={TagKind.USER} onTagToggle={mockOnTagToggle} />,
    );

    expect(screen.getByText('bitcoin')).toHaveAttribute('data-loading', 'true');
    expect(screen.getByText('bitcoin')).toHaveAttribute('data-loading-more', 'false');
    expect(screen.getByText('satoshi')).toHaveAttribute('data-loading', 'false');
    expect(screen.getByText('satoshi')).toHaveAttribute('data-loading-more', 'true');
  });

  it('loads the next page of taggers on request', () => {
    render(
      <TaggedList tags={mockTags} taggedId="profile-pubky" taggedKind={TagKind.USER} onTagToggle={mockOnTagToggle} />,
    );

    fireEvent.click(screen.getByTestId('load-more-bitcoin'));

    expect(mockLoadMoreTaggers).toHaveBeenCalledWith('bitcoin');
  });
});

describe('TaggedList - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnTagToggle.mockClear();
  });

  it('matches snapshot with tags', () => {
    const { container } = render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty tags', () => {
    const { container } = render(<TaggedList tags={[]} onTagToggle={mockOnTagToggle} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
