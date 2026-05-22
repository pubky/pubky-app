import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { SinglePost } from './SinglePost';

const VALID_COMPOSITE_POST_ID = `${PUBKY_52_STAGING_FIXTURE}:${POST_ID_STAGING_FIXTURE}`;

const SHORT_POST_DETAILS = {
  id: VALID_COMPOSITE_POST_ID,
  indexed_at: Date.now(),
  kind: 'short' as const,
  uri: `pubky://${PUBKY_52_STAGING_FIXTURE}/pub/pubky.app/posts/${POST_ID_STAGING_FIXTURE}`,
  content: 'Hello',
  attachments: [],
  is_moderated: false,
  is_blurred: false,
} satisfies EnrichedPostDetails;

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    rightDrawerContent,
    feedVariant,
    classNameWrapperContent,
  }: {
    children: React.ReactNode;
    leftSidebarContent?: React.ReactNode;
    rightSidebarContent?: React.ReactNode;
    leftDrawerContent?: React.ReactNode;
    rightDrawerContent?: React.ReactNode;
    feedVariant?: string;
    classNameWrapperContent?: string;
  }) => (
    <div data-testid="content-layout" data-feed-variant={feedVariant} data-wrapper-class-name={classNameWrapperContent}>
      {leftSidebarContent && <div data-testid="left-sidebar">{leftSidebarContent}</div>}
      {rightSidebarContent && <div data-testid="right-sidebar">{rightSidebarContent}</div>}
      {leftDrawerContent && <div data-testid="left-drawer">{leftDrawerContent}</div>}
      {rightDrawerContent && <div data-testid="right-drawer">{rightDrawerContent}</div>}
      {children}
    </div>
  ),
}));

vi.mock('@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar', () => ({
  SinglePostLeftSidebar: () => <div data-testid="single-post-left-sidebar">SinglePostLeftSidebar</div>,
  SinglePostLeftDrawer: () => <div data-testid="single-post-left-drawer">SinglePostLeftDrawer</div>,
}));

vi.mock('@/organisms/SinglePostRightPanel/SinglePostRightPanel', () => ({
  SinglePostRightPanel: ({ postId, showFeedback = true }: { postId: string; showFeedback?: boolean }) => (
    <div data-testid="single-post-right-panel" data-post-id={postId} data-show-feedback={String(showFeedback)}>
      SinglePostRightPanel
    </div>
  ),
}));

vi.mock('@/organisms/PostNotFoundDiscoveryView/PostNotFoundDiscoveryView', () => ({
  PostNotFoundDiscoveryView: ({ postId }: { postId: string }) => (
    <div data-testid="post-not-found-discovery" data-post-id={postId}>
      PostNotFoundDiscoveryView
    </div>
  ),
}));

vi.mock('@/organisms/SinglePostContent/SinglePostContent', () => ({
  SinglePostContent: ({ postId, postDetails }: { postId: string; postDetails: EnrichedPostDetails }) => (
    <div data-testid="single-post-content" data-post-id={postId} data-has-post-details={String(!!postDetails)}>
      SinglePostContent
    </div>
  ),
}));

describe('SinglePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: SHORT_POST_DETAILS,
      isLoading: false,
    });
  });

  it('renders post not found discovery when composite id has invalid pubky segment', () => {
    const invalidComposite = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;
    render(<SinglePost postId={invalidComposite} />);

    const notFound = screen.getByTestId('post-not-found-discovery');
    expect(notFound).toHaveAttribute('data-post-id', invalidComposite);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
    expect(usePostDetails).toHaveBeenCalledWith(invalidComposite, { enabled: false });
  });

  it('renders post not found discovery when post cannot be resolved', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: false,
    });

    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    const notFound = screen.getByTestId('post-not-found-discovery');
    expect(notFound).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
  });

  it('renders content layout shell when post is loading', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('renders content layout shell when post exists', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(usePostDetails).toHaveBeenCalledWith(VALID_COMPOSITE_POST_ID, { enabled: true });
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('renders SinglePostLeftSidebar in left sidebar', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(screen.getByTestId('single-post-left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('left-sidebar')).toContainElement(screen.getByTestId('single-post-left-sidebar'));
  });

  it('renders SinglePostLeftDrawer in left drawer', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(screen.getByTestId('single-post-left-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('left-drawer')).toContainElement(screen.getByTestId('single-post-left-drawer'));
  });

  it('renders SinglePostRightPanel in right sidebar with postId', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    const rightSidebar = screen.getByTestId('right-sidebar');
    const rightPanel = within(rightSidebar).getByTestId('single-post-right-panel');

    expect(rightPanel).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
    expect(rightPanel).toHaveAttribute('data-show-feedback', 'true');
  });

  it('renders SinglePostRightPanel in right drawer with postId and hidden feedback', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    const rightDrawer = screen.getByTestId('right-drawer');
    const rightPanel = within(rightDrawer).getByTestId('single-post-right-panel');

    expect(rightPanel).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
    expect(rightPanel).toHaveAttribute('data-show-feedback', 'false');
  });

  it('renders SinglePostContent with postId and details when loaded', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    const el = screen.getByTestId('single-post-content');
    expect(el).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
    expect(el).toHaveAttribute('data-has-post-details', 'true');
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);
    expect(container).toMatchSnapshot();
  });
});
