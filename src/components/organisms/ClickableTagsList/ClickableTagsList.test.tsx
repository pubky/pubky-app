import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { ClickableTagsList } from './ClickableTagsList';

function getPostTagButton(label: string, count?: number) {
  const name = count !== undefined ? `${label} tag (${count} posts)` : `${label} tag`;
  return screen.getByRole('button', { name });
}

function queryPostTagButton(label: string) {
  return screen.queryByRole('button', { name: `${label} tag` });
}

// Mock hooks
const mockHandleTagToggle = vi.fn();
const mockHandleTagAdd = vi.fn().mockResolvedValue({ success: true });
const mockIsViewerTagger = vi.fn((tag: TagWithAvatars) => tag.relationship ?? false);
let mockIsAuthenticated = true;
const { mockTagInputToggle, mockTagInput, mockPostTagAddButton } = vi.hoisted(() => ({
  mockTagInputToggle: vi.fn(
    ({
      showInput,
      inputContent,
      addButtonContent,
    }: {
      showInput: boolean;
      inputContent: React.ReactNode;
      addButtonContent: React.ReactNode;
    }) => <div data-testid="tag-input-toggle">{showInput ? inputContent : addButtonContent}</div>,
  ),
  mockTagInput: vi.fn(
    ({
      onTagAdd,
      onBlur,
      onClose,
      showCloseButton,
      onClick,
    }: {
      onTagAdd: (tag: string) => void;
      onBlur?: () => void;
      onClose?: () => void;
      showCloseButton?: boolean;
      onClick?: () => void;
    }) => (
      <>
        <input
          data-testid="tag-input"
          onChange={(e) => e.target.value && onTagAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const target = e.target as HTMLInputElement;
              if (target.value) onTagAdd(target.value);
            }
          }}
          onBlur={onBlur}
          onClick={onClick}
        />
        {showCloseButton && (
          <button data-testid="tag-input-close" onClick={onClose}>
            Close
          </button>
        )}
      </>
    ),
  ),
  mockPostTagAddButton: vi.fn(
    ({ onClick, variant, disabled }: { onClick: () => void; variant?: string; disabled?: boolean }) => (
      <button data-testid="post-tag-add-button" data-variant={variant} onClick={onClick} disabled={disabled}>
        Add
      </button>
    ),
  ),
}));

vi.mock('@/hooks/useEntityTags/useEntityTags', () => ({
  useEntityTags: vi.fn((_entityId, _taggedKind, options) => ({
    tags: options?.providedTags ?? [],
    count: options?.providedTags?.length ?? 0,
    isLoading: false,
    isViewerTagger: mockIsViewerTagger,
    handleTagToggle: mockHandleTagToggle,
    handleTagAdd: mockHandleTagAdd,
  })),
}));

vi.mock('@/hooks/useTagSuggestions/useTagSuggestions', () => ({
  useTagSuggestions: vi.fn(() => ({
    suggestions: [],
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    requireAuth: <T,>(action: () => T) => (mockIsAuthenticated ? action() : (undefined as T)),
  }),
}));

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: vi.fn((tags: NexusTag[]) => ({
    enrichedTags: tags.map((tag) => ({
      ...tag,
      taggers: tag.taggers.map((taggerId, index) => ({
        id: taggerId as Pubky,
        name: `User ${index + 1}`,
        avatarUrl: `https://example.com/${taggerId}.png`,
      })),
    })),
    isLoading: false,
  })),
}));

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: () => false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/usePostTaggers/usePostTaggers', () => ({
  usePostTaggers: () => ({
    taggersByLabel: new Map(),
    taggerStates: new Map(),
    fetchAllTaggers: vi.fn(),
  }),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ name }: { name: string }) => <div data-testid={`avatar-${name}`}>Avatar</div>,
}));

vi.mock('@/molecules/UserInfoPopover/UserInfoPopover', () => ({
  UserInfoPopover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-info-popover">{children}</div>
  ),
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <span className={className}>{children}</span>
    ),
  };
});

vi.mock('@/molecules/PostTag/PostTag', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules/PostTag/PostTag')>();
  return actual;
});

vi.mock('@/molecules/PostTagAddButton/PostTagAddButton', () => {
  return {
    PostTagAddButton: mockPostTagAddButton,
  };
});

vi.mock('@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper')>();
  return actual;
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  return {
    TagInput: mockTagInput,
  };
});

vi.mock('@/molecules/TagInputToggle/TagInputToggle', () => {
  return {
    TagInputToggle: mockTagInputToggle,
  };
});

describe('ClickableTagsList', () => {
  const mockTags: NexusTag[] = [
    { label: 'bitcoin', taggers_count: 5, taggers: ['user1', 'user2'], relationship: true },
    { label: 'ethereum', taggers_count: 3, taggers: ['user3'], relationship: false },
    { label: 'web3', taggers_count: 10, taggers: [], relationship: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockIsViewerTagger.mockImplementation((tag: TagWithAvatars) => tag.relationship ?? false);
    useAuthStore.setState({ setShowSignInDialog: vi.fn() });
  });

  describe('Rendering', () => {
    it('renders correctly with tags', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} />);

      expect(getPostTagButton('bitcoin', 5)).toBeInTheDocument();
      expect(getPostTagButton('ethereum', 3)).toBeInTheDocument();
      expect(getPostTagButton('web3', 10)).toBeInTheDocument();
    });

    it('limits visible tags without constraining the add-tag input', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxVisibleTags={1}
          showAddButton
          addMode
        />,
      );

      expect(getPostTagButton('bitcoin', 5)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ethereum tag (3 posts)' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'web3 tag (10 posts)' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('post-tag-add-button'));

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(mockTagInput).toHaveBeenLastCalledWith(expect.objectContaining({ maxTags: undefined }), undefined);
    });

    it('returns null when no tags and no input/button', () => {
      const { container } = render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('shows tag count when showCount is true', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showCount={true} />);

      expect(getPostTagButton('bitcoin', 5)).toHaveAccessibleName('bitcoin tag (5 posts)');
    });

    it('hides tag count when showCount is false', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showCount={false} />);

      expect(getPostTagButton('bitcoin')).toHaveAccessibleName('bitcoin tag');
    });

    it('shows selected state for viewer tags', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} />);

      expect(getPostTagButton('bitcoin', 5)).toHaveAttribute('aria-pressed', 'true');
      expect(getPostTagButton('ethereum', 3)).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows close button when showTagClose is true', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showTagClose={true} />);

      expect(screen.getByLabelText('Remove bitcoin tag')).toBeInTheDocument();
    });

    it('filters out tags when total character count exceeds maxTotalChars', () => {
      const tagsExceedingLimit: NexusTag[] = [
        { label: 'bitcoin', taggers_count: 5, taggers: ['user1'], relationship: true },
        { label: 'ethereum', taggers_count: 3, taggers: ['user2'], relationship: false },
        { label: 'crypto', taggers_count: 10, taggers: [], relationship: false },
      ];

      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={tagsExceedingLimit} />);

      // First two tags should render (7 + 8 = 15 chars, within 20 limit)
      expect(getPostTagButton('bitcoin', 5)).toBeInTheDocument();
      expect(getPostTagButton('ethereum', 3)).toBeInTheDocument();

      // Third tag should be filtered out (would make total 21 chars, exceeding 20)
      expect(queryPostTagButton('crypto')).not.toBeInTheDocument();
    });
  });

  describe('Input visibility', () => {
    it('shows input when showInput is true', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showInput={true} />);

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });

    it('hides input when showInput is false', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showInput={false} />);

      expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();
    });

    it('shows add button when showAddButton is true and no input', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          showInput={false}
        />,
      );

      expect(screen.getByTestId('post-tag-add-button')).toBeInTheDocument();
    });

    it('hides add button when showInput is true', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          showInput={true}
        />,
      );

      expect(screen.queryByTestId('post-tag-add-button')).not.toBeInTheDocument();
    });

    it('keeps input visible when initialized with showInput and parent toggles to add button', () => {
      const { rerender } = render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showInput={true}
          showAddButton={false}
        />,
      );

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tag-add-button')).not.toBeInTheDocument();

      rerender(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showInput={false}
          showAddButton={true}
        />,
      );

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tag-add-button')).not.toBeInTheDocument();
    });

    it('shows input when parent toggles from add-button mode to input mode', () => {
      const { rerender } = render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={false}
          showAddButton={true}
        />,
      );

      expect(screen.getByTestId('post-tag-add-button')).toBeInTheDocument();

      rerender(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
          showAddButton={false}
        />,
      );

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.queryByTestId('post-tag-add-button')).not.toBeInTheDocument();
    });

    it('uses shared width animation config in toggle', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
          showAddButton={false}
        />,
      );

      expect(mockTagInputToggle).toHaveBeenCalled();
      expect(mockTagInputToggle.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          widthByState: { input: 130, addButton: 34 },
        }),
      );
    });

    it('uses expanded input width when limit is reached', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={3}
          showInput={true}
          showAddButton={false}
        />,
      );

      expect(mockTagInputToggle).toHaveBeenCalled();
      expect(mockTagInputToggle.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          widthByState: { input: 162, addButton: 34 },
        }),
      );
    });

    it('passes plain TagInput variant and max-tag metadata', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={3}
          showInput={true}
        />,
      );

      expect(mockTagInput).toHaveBeenCalledWith(
        expect.objectContaining({
          containerVariant: 'plain',
          maxTags: 3,
          currentTagsCount: 3,
          disabled: false,
        }),
        undefined,
      );
    });

    it('keeps add button enabled at max tags for authenticated users', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={3}
          showAddButton={true}
        />,
      );

      expect(screen.getByTestId('post-tag-add-button')).toBeEnabled();
      expect(mockPostTagAddButton).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'plain',
        }),
        undefined,
      );
    });

    it('keeps input open on blur when not in addMode', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
          addMode={false}
        />,
      );

      fireEvent.blur(screen.getByTestId('tag-input'));

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });

    it('does not close input via onClose callback when not in addMode', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
          addMode={false}
        />,
      );

      const tagInputProps = mockTagInput.mock.calls.at(-1)?.[0] as { onClose?: () => void } | undefined;
      tagInputProps?.onClose?.();

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls handleTagToggle when tag is clicked without custom handler', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} />);

      fireEvent.click(getPostTagButton('bitcoin', 5));

      expect(mockHandleTagToggle).toHaveBeenCalled();
    });

    it('calls custom onTagClick when provided', () => {
      const customHandler = vi.fn();
      render(
        <ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} onTagClick={customHandler} />,
      );

      fireEvent.click(getPostTagButton('bitcoin', 5));

      expect(customHandler).toHaveBeenCalled();
      expect(mockHandleTagToggle).not.toHaveBeenCalled();
    });

    it('calls onTagClose when close button is clicked', () => {
      const closeHandler = vi.fn();
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showTagClose={true}
          onTagClose={closeHandler}
        />,
      );

      fireEvent.click(screen.getByLabelText('Remove bitcoin tag'));

      expect(closeHandler).toHaveBeenCalled();
    });

    it('calls onAddButtonClick when add button is clicked', () => {
      const addButtonHandler = vi.fn();
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          maxTags={10}
          onAddButtonClick={addButtonHandler}
        />,
      );

      fireEvent.click(screen.getByTestId('post-tag-add-button'));

      expect(addButtonHandler).toHaveBeenCalled();
    });

    it('calls custom onTagAdd when provided', () => {
      const onTagAdd = vi.fn();
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
          onTagAdd={onTagAdd}
        />,
      );

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'nostr' } });

      expect(onTagAdd).toHaveBeenCalledWith('nostr');
      expect(mockHandleTagAdd).not.toHaveBeenCalled();
    });

    it('falls back to internal handleTagAdd when onTagAdd is not provided', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
        />,
      );

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'nostr' } });

      expect(mockHandleTagAdd).toHaveBeenCalledWith('nostr');
    });

    it('opens sign-in dialog when unauthenticated user clicks input', () => {
      mockIsAuthenticated = false;
      const setShowSignInDialog = vi.fn();
      useAuthStore.setState({ setShowSignInDialog });

      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showInput={true}
        />,
      );

      fireEvent.click(screen.getByTestId('tag-input'));

      expect(setShowSignInDialog).toHaveBeenCalledWith(true);
    });
  });

  describe('Add mode', () => {
    it('shows input when add button is clicked in addMode', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          maxTags={10}
          addMode={true}
        />,
      );

      expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('post-tag-add-button'));

      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });

    it('auto-focuses input when entering addMode', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          maxTags={10}
          addMode={true}
        />,
      );

      fireEvent.click(screen.getByTestId('post-tag-add-button'));

      expect(mockTagInput).toHaveBeenLastCalledWith(
        expect.objectContaining({
          autoFocus: true,
        }),
        undefined,
      );
    });

    it('closes input on blur in addMode', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          maxTags={10}
          addMode={true}
        />,
      );

      fireEvent.click(screen.getByTestId('post-tag-add-button'));
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();

      fireEvent.blur(screen.getByTestId('tag-input'));

      expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-tag-add-button')).toBeInTheDocument();
    });

    it('closes input on close button click in addMode', () => {
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          maxTags={10}
          addMode={true}
        />,
      );

      fireEvent.click(screen.getByTestId('post-tag-add-button'));
      expect(screen.getByTestId('tag-input-close')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('tag-input-close'));

      expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-tag-add-button')).toBeInTheDocument();
    });

    it('keeps input open after add in addMode', () => {
      const onTagAdd = vi.fn();
      render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          showAddButton={true}
          maxTags={10}
          addMode={true}
          onTagAdd={onTagAdd}
        />,
      );

      fireEvent.click(screen.getByTestId('post-tag-add-button'));
      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'seamless' } });

      expect(onTagAdd).toHaveBeenCalledWith('seamless');
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
    });
  });

  describe('TagKind support', () => {
    it('works with USER tags', () => {
      render(<ClickableTagsList taggedId="user-123" taggedKind={TagKind.USER} tags={mockTags} />);

      expect(getPostTagButton('bitcoin', 5)).toBeInTheDocument();
    });

    it('works with POST tags', () => {
      render(<ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} />);

      expect(getPostTagButton('bitcoin', 5)).toBeInTheDocument();
    });
  });

  describe('Snapshots', () => {
    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it('matches snapshot with input visible', () => {
      const { container } = render(
        <ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showInput={true} />,
      );

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with add button', () => {
      const { container } = render(
        <ClickableTagsList
          taggedId="post-123"
          taggedKind={TagKind.POST}
          tags={mockTags}
          maxTags={10}
          showAddButton={true}
        />,
      );

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with close buttons', () => {
      const { container } = render(
        <ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={mockTags} showTagClose={true} />,
      );

      expect(container).toMatchSnapshot();
    });
  });
});

const snapshotTags: NexusTag[] = [
  { label: 'bitcoin', taggers_count: 5, taggers: ['user1', 'user2'], relationship: true },
  { label: 'ethereum', taggers_count: 3, taggers: ['user3'], relationship: false },
  { label: 'web3', taggers_count: 10, taggers: [], relationship: false },
];

describe('ClickableTagsList - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockUseIsMobile.mockReturnValue(false);
    useAuthStore.setState({ setShowSignInDialog: vi.fn() });
  });

  it('matches snapshot with tags and count', () => {
    const { container } = render(
      <ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={snapshotTags} showCount={true} />,
    );
    expect(container).toMatchSnapshot();
  });
});

describe('ClickableTagsList - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
    useAuthStore.setState({ setShowSignInDialog: vi.fn() });
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(
      <ClickableTagsList taggedId="post-123" taggedKind={TagKind.POST} tags={snapshotTags} showCount={true} />,
    );
    expect(container).toMatchSnapshot();
  });
});
