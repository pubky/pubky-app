import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntityTags } from '@/hooks/useEntityTags/useEntityTags';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { PostTagsExpandableRow } from './PostTagsExpandableRow';

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

vi.mock('@/hooks/useEntityTags/useEntityTags', () => ({
  useEntityTags: vi.fn(),
}));

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: vi.fn((tags: TagWithAvatars[]) => ({
    enrichedTags: tags,
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
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

vi.mock('@/organisms/PostTagsPanel/PostTagsPanel', () => ({
  PostTagsPanel: ({
    postId,
    widthMode,
    autoFocusInput,
    enableLoadingSkeleton,
    className,
  }: {
    postId: string;
    widthMode: string;
    autoFocusInput: boolean;
    enableLoadingSkeleton: boolean;
    className?: string;
  }) => (
    <div
      className={className}
      data-auto-focus-input={String(autoFocusInput)}
      data-enable-loading-skeleton={String(enableLoadingSkeleton)}
      data-post-id={postId}
      data-testid="post-tags-panel"
      data-width-mode={widthMode}
    />
  ),
}));

const POST_ID = 'author:post-1';
const snapshotTags: TagWithAvatars[] = [
  {
    label: 'bitcoin',
    taggers_count: 5,
    taggers: [
      { id: 'user1', name: 'User 1', avatarUrl: 'https://example.com/user1.png' },
      { id: 'user2', name: 'User 2', avatarUrl: 'https://example.com/user2.png' },
    ],
    relationship: true,
  },
  {
    label: 'ethereum',
    taggers_count: 3,
    taggers: [{ id: 'user3', name: 'User 3', avatarUrl: 'https://example.com/user3.png' }],
    relationship: false,
  },
  { label: 'web3', taggers_count: 10, taggers: [], relationship: false },
];
const mockUsePostCounts = vi.mocked(usePostCounts);
const mockUseEntityTags = vi.mocked(useEntityTags);
const mockIsViewerTagger = vi.fn((tag: TagWithAvatars) => tag.relationship ?? false);
const mockHandleTagToggle = vi.fn();
const mockHandleTagAdd = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockUseIsMobile.mockReturnValue(false);
  mockUsePostCounts.mockReturnValue({
    postCounts: {
      id: POST_ID,
      tags: 5,
      unique_tags: 3,
      reposts: 0,
      replies: 0,
    },
    isLoading: false,
  });
  mockUseEntityTags.mockReturnValue({
    tags: snapshotTags,
    count: snapshotTags.length,
    isLoading: false,
    isViewerTagger: mockIsViewerTagger,
    handleTagToggle: mockHandleTagToggle,
    handleTagAdd: mockHandleTagAdd,
  });
  useAuthStore.setState({ setShowSignInDialog: vi.fn() });
});

describe('PostTagsExpandableRow', () => {
  it('renders collapsed clickable tags and the tag CTA count', () => {
    const { container } = render(<PostTagsExpandableRow postId={POST_ID} />);

    expect(container.querySelector('[data-cy="clickable-tags-list"]')).toBeInTheDocument();
    expect(screen.getByLabelText('Add new tag')).toBeInTheDocument();
    expect(screen.getByLabelText('Tag post (3)')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('post-tags-panel')).not.toBeInTheDocument();
  });

  it('forwards the visible tag limit to the collapsed tag list', () => {
    render(<PostTagsExpandableRow postId={POST_ID} maxVisibleTags={1} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.queryByText('ethereum')).not.toBeInTheDocument();
    expect(screen.queryByText('web3')).not.toBeInTheDocument();
  });

  it('toggles from clickable tags to the editable tags panel', () => {
    render(<PostTagsExpandableRow postId={POST_ID} />);

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    expect(document.querySelector('[data-cy="clickable-tags-list"]')).not.toBeInTheDocument();
    const panel = screen.getByTestId('post-tags-panel');
    expect(panel).toHaveAttribute('data-post-id', POST_ID);
    expect(panel).toHaveAttribute('data-width-mode', 'fit');
    expect(panel).toHaveAttribute('data-auto-focus-input', 'true');
    expect(panel).toHaveAttribute('data-enable-loading-skeleton', 'false');
    expect(screen.getByLabelText('Tag post (3)')).toHaveAttribute('aria-expanded', 'true');
  });

  it('uses panelWidthMode full when expanded', () => {
    render(<PostTagsExpandableRow postId={POST_ID} panelWidthMode="full" />);

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    const panel = screen.getByTestId('post-tags-panel');
    expect(panel).toHaveAttribute('data-width-mode', 'full');
    expect(panel).toHaveAttribute('data-auto-focus-input', 'true');
    expect(panel).toHaveAttribute('data-enable-loading-skeleton', 'false');
  });

  it('defaults panelWidthMode to fit when expanded', () => {
    render(<PostTagsExpandableRow postId={POST_ID} />);

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    expect(screen.getByTestId('post-tags-panel')).toHaveAttribute('data-width-mode', 'fit');
  });

  it('renders a tag CTA skeleton while counts are loading', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: undefined,
      isLoading: true,
    });

    const { container } = render(<PostTagsExpandableRow postId={POST_ID} />);

    expect(container.querySelector('[data-cy="post-tag-btn-skeleton"]')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tag post/)).not.toBeInTheDocument();
  });

  it('renders a zero-count tag CTA when counts are unavailable after loading', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: undefined,
      isLoading: false,
    });

    const { container } = render(<PostTagsExpandableRow postId={POST_ID} />);

    expect(container.querySelector('[data-cy="post-tag-btn-skeleton"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tag post (0)')).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders extra actions after the tag CTA', () => {
    render(
      <PostTagsExpandableRow postId={POST_ID}>
        <button type="button" aria-label="extra action">
          Extra
        </button>
      </PostTagsExpandableRow>,
    );

    const tagButton = screen.getByLabelText('Tag post (3)');
    const extraButton = screen.getByLabelText('extra action');
    expect(tagButton.compareDocumentPosition(extraButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the default tag CTA when an external trigger owns expansion', () => {
    const { container } = render(
      <PostTagsExpandableRow postId={POST_ID} expanded={false} onExpandedChange={vi.fn()} showTagToggle={false} />,
    );

    expect(container.querySelector('[data-cy="clickable-tags-list"]')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tag post (3)')).not.toBeInTheDocument();
    expect(container.querySelector('[data-cy="post-tags-expandable-row-actions"]')).not.toBeInTheDocument();
  });

  it('renders the editable panel from controlled expanded state without the default tag CTA', () => {
    render(<PostTagsExpandableRow postId={POST_ID} expanded onExpandedChange={vi.fn()} showTagToggle={false} />);

    expect(document.querySelector('[data-cy="clickable-tags-list"]')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-tags-panel')).toHaveAttribute('data-post-id', POST_ID);
    expect(screen.queryByLabelText('Tag post (3)')).not.toBeInTheDocument();
  });

  it('stops propagation without preventing defaults by default', () => {
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <PostTagsExpandableRow postId={POST_ID} />
      </div>,
    );

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    act(() => {
      screen.getByLabelText('Tag post (3)').dispatchEvent(event);
    });

    expect(onParentClick).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('prevents defaults for rows rendered inside navigable cards', () => {
    render(<PostTagsExpandableRow postId={POST_ID} preventDefaultOnClick />);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    act(() => {
      screen.getByLabelText('Tag post (3)').dispatchEvent(event);
    });

    expect(preventDefault).toHaveBeenCalled();
  });

  it('lets expanded panel gaps bubble to parent navigable surfaces', () => {
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <PostTagsExpandableRow postId={POST_ID} preventDefaultOnClick />
      </div>,
    );

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    const tagsColumn = document.querySelector('[data-cy="post-tags-expandable-row"]')?.firstElementChild;
    expect(tagsColumn).toBeTruthy();
    fireEvent.click(tagsColumn!);

    expect(onParentClick).toHaveBeenCalledTimes(1);
  });

  it('suppresses navigation when clicking the expanded panel content area', () => {
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <PostTagsExpandableRow postId={POST_ID} preventDefaultOnClick />
      </div>,
    );

    fireEvent.click(screen.getByLabelText('Tag post (3)'));
    fireEvent.click(screen.getByTestId('post-tags-panel'));

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('sizes the expanded panel wrapper to its content instead of stretching', () => {
    render(<PostTagsExpandableRow postId={POST_ID} preventDefaultOnClick />);

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    expect(document.querySelector('[data-cy="post-tags-expandable-panel"]')).toHaveClass('w-fit', 'max-w-full');
  });

  it('aligns the row and actions to the bottom when expanded', () => {
    const { container } = render(<PostTagsExpandableRow postId={POST_ID} />);

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    expect(container.querySelector('[data-cy="post-tags-expandable-row"]')).toHaveClass('items-end');
    expect(container.querySelector('[data-cy="post-tags-expandable-row-actions"]')).toHaveClass('self-end');
  });
});

describe('PostTagsExpandableRow - Snapshots', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
  });

  it('matches the collapsed snapshot with extra actions', () => {
    const { container } = render(
      <PostTagsExpandableRow postId={POST_ID}>
        <button type="button" aria-label="extra action">
          Extra
        </button>
      </PostTagsExpandableRow>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the expanded snapshot', () => {
    const { container } = render(<PostTagsExpandableRow postId={POST_ID} />);

    fireEvent.click(screen.getByLabelText('Tag post (3)'));

    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('PostTagsExpandableRow - Mobile Snapshots', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(
      <PostTagsExpandableRow postId={POST_ID}>
        <button type="button" aria-label="extra action">
          Extra
        </button>
      </PostTagsExpandableRow>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
