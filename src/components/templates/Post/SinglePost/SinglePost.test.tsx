import { render, screen } from '@testing-library/react';
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/organisms/PostPageShell/PostPageShell', () => ({
  PostPageShell: ({ children, postId }: { children: React.ReactNode; postId: string }) => (
    <div data-testid="post-page-shell" data-post-id={postId}>
      {children}
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

vi.mock('@/organisms/SinglePostContent/SinglePostContent.skeleton', () => ({
  SinglePostContentSkeleton: () => <div data-testid="single-post-content-skeleton">SinglePostContentSkeleton</div>,
}));

describe('SinglePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: SHORT_POST_DETAILS,
      isLoading: false,
    });
  });

  it('wraps content in PostPageShell with postId', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(screen.getByTestId('post-page-shell')).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
  });

  it('renders post not found discovery when composite id has invalid pubky segment', () => {
    const invalidComposite = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;
    render(<SinglePost postId={invalidComposite} />);

    const notFound = screen.getByTestId('post-not-found-discovery');
    expect(notFound).toHaveAttribute('data-post-id', invalidComposite);
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
  });

  it('renders skeleton while post is loading', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(screen.getByTestId('single-post-content-skeleton')).toBeInTheDocument();
  });

  it('renders SinglePostContent with postId and details when loaded', () => {
    render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);

    expect(usePostDetails).toHaveBeenCalledWith(VALID_COMPOSITE_POST_ID, { enabled: true });
    const el = screen.getByTestId('single-post-content');
    expect(el).toHaveAttribute('data-post-id', VALID_COMPOSITE_POST_ID);
    expect(el).toHaveAttribute('data-has-post-details', 'true');
  });

  it('matches snapshot when post is loaded', () => {
    const { container } = render(<SinglePost postId={VALID_COMPOSITE_POST_ID} />);
    expect(container).toMatchSnapshot();
  });
});
