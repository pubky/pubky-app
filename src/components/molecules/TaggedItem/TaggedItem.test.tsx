import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaggedItem } from './TaggedItem';
import type { TagWithAvatars } from './TaggedItem.types';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Atoms.Tag and Button
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      'aria-expanded': ariaExpanded,
      'aria-label': ariaLabel,
      overrideDefaults: _overrideDefaults,
      ...rest
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      'aria-expanded'?: boolean;
      'aria-label'?: string;
      overrideDefaults?: boolean;
    }) => (
      <button
        data-testid={ariaLabel?.includes('users who tagged') ? 'avatar-group-button' : 'search-button'}
        onClick={onClick}
        aria-expanded={ariaExpanded}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Tag/Tag', () => {
  return {
    Tag: ({ name, count }: { name: string; count?: number }) => (
      <div data-testid="tag">
        {name} {count !== undefined && `(${count})`}
      </div>
    ),
  };
});

// Mock AvatarWithFallback
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({ name }: { name: string }) => (
      <div data-testid="avatar" data-name={name}>
        Avatar
      </div>
    ),
  };
});

// Mock WhoTaggedExpandedList
vi.mock('@/molecules/WhoTaggedExpandedList/WhoTaggedExpandedList', () => {
  return {
    WhoTaggedExpandedList: ({
      taggerIds,
      hasMore,
      isLoadingMore,
      onLoadMore,
    }: {
      taggerIds: Array<string>;
      hasMore?: boolean;
      isLoadingMore?: boolean;
      onLoadMore?: () => void;
    }) => (
      <div data-testid="who-tagged-expanded-list" data-has-more={hasMore} data-loading-more={isLoadingMore}>
        Expanded List ({taggerIds.length} users)
        <button data-testid="who-tagged-load-more" onClick={onLoadMore}>
          more
        </button>
      </div>
    ),
  };
});

// Mock hooks - useRequireAuth needs to execute the action for authenticated users
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    requireAuth: vi.fn((action: () => void) => action()),
  })),
}));

const mockTag: TagWithAvatars = {
  label: 'bitcoin',
  taggers: [
    { id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1' },
    { id: 'user2', avatarUrl: 'https://cdn.example.com/avatar/user2' },
    { id: 'user3', avatarUrl: 'https://cdn.example.com/avatar/user3' },
  ],
  taggers_count: 3,
  relationship: false,
};

const mockOnTagClick = vi.fn();

describe('TaggedItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  it('renders tag label and count', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} />);
    expect(screen.getByText('bitcoin (3)')).toBeInTheDocument();
  });

  it('calls onSearchClick when search button is clicked', () => {
    const mockOnSearchClick = vi.fn();
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} onSearchClick={mockOnSearchClick} />);
    fireEvent.click(screen.getByTestId('search-button'));
    expect(mockOnSearchClick).toHaveBeenCalledTimes(1);
  });

  it('navigates to search with tag when search button clicked without onSearchClick', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} />);
    fireEvent.click(screen.getByTestId('search-button'));
    expect(mockPush).toHaveBeenCalledWith('/search?tags=bitcoin');
  });

  it('renders avatars for taggers', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} />);
    const avatars = screen.getAllByTestId('avatar');
    expect(avatars.length).toBeGreaterThan(0);
  });

  it('hides avatars when hideAvatars is true', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} hideAvatars />);
    expect(screen.queryAllByTestId('avatar')).toHaveLength(0);
  });

  it('still shows count in tag when hideAvatars is true', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} hideAvatars />);
    expect(screen.getByText('bitcoin (3)')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TaggedItem - Expand/Collapse (Controlled)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  it('does not show expanded list when isExpanded is false', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} isExpanded={false} />);
    expect(screen.queryByTestId('who-tagged-expanded-list')).not.toBeInTheDocument();
  });

  it('shows expanded list when isExpanded is true', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} isExpanded={true} />);
    expect(screen.getByTestId('who-tagged-expanded-list')).toBeInTheDocument();
  });

  it('calls onExpandToggle with tag label when avatar group is clicked', () => {
    const mockOnExpandToggle = vi.fn();
    render(
      <TaggedItem tag={mockTag} onTagClick={mockOnTagClick} isExpanded={false} onExpandToggle={mockOnExpandToggle} />,
    );
    const avatarGroupButton = screen.getByTestId('avatar-group-button');
    fireEvent.click(avatarGroupButton);
    expect(mockOnExpandToggle).toHaveBeenCalledWith('bitcoin');
  });

  it('forwards paging props to the expanded list', () => {
    const onLoadMoreTaggers = vi.fn();
    render(
      <TaggedItem
        tag={mockTag}
        onTagClick={mockOnTagClick}
        isExpanded={true}
        expandedTaggerIds={['user1', 'user2', 'user3', 'user4']}
        hasMoreTaggers
        isLoadingMoreTaggers
        onLoadMoreTaggers={onLoadMoreTaggers}
      />,
    );

    const list = screen.getByTestId('who-tagged-expanded-list');
    expect(list).toHaveTextContent('Expanded List (4 users)');
    expect(list).toHaveAttribute('data-has-more', 'true');
    expect(list).toHaveAttribute('data-loading-more', 'true');

    fireEvent.click(screen.getByTestId('who-tagged-load-more'));
    expect(onLoadMoreTaggers).toHaveBeenCalledTimes(1);
  });

  it('does not render avatar group button when hideAvatars is true', () => {
    render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} hideAvatars />);
    expect(screen.queryByTestId('avatar-group-button')).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly based on isExpanded prop', () => {
    const { rerender } = render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} isExpanded={false} />);
    const avatarGroupButton = screen.getByTestId('avatar-group-button');
    expect(avatarGroupButton).toHaveAttribute('aria-expanded', 'false');

    rerender(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} isExpanded={true} />);
    expect(avatarGroupButton).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('TaggedItem - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  it('matches snapshot with hideAvatars', () => {
    const { container } = render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} hideAvatars />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when expanded', () => {
    const { container } = render(<TaggedItem tag={mockTag} onTagClick={mockOnTagClick} isExpanded={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
