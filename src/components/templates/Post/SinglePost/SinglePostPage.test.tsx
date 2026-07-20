import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { SinglePostPage } from './SinglePostPage';

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

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/organisms/PostNotFoundDiscoveryView/PostNotFoundDiscoveryView', () => ({
  PostNotFoundDiscoveryView: ({ postId }: { postId: string }) => (
    <div data-testid="post-not-found-discovery" data-post-id={postId}>
      PostNotFoundDiscoveryView
    </div>
  ),
}));

vi.mock('@/organisms/SinglePostContent/SinglePostContent', () => ({
  SinglePostContent: ({ postId }: { postId: string }) => (
    <div data-testid="single-post-content" data-post-id={postId}>
      SinglePostContent
    </div>
  ),
}));

vi.mock('@/organisms/SinglePostContent/SinglePostContent.skeleton', () => ({
  SinglePostContentSkeleton: () => <div data-testid="single-post-content-skeleton">SinglePostContentSkeleton</div>,
}));

describe('SinglePostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: SHORT_POST_DETAILS,
      isLoading: false,
    });
  });

  it('does not render a layout shell', () => {
    const { container } = render(<SinglePostPage postId={VALID_COMPOSITE_POST_ID} />);
    expect(container.firstChild).not.toHaveAttribute('data-testid', 'content-layout');
  });

  it('renders not found without fetching invalid composite ids', () => {
    const invalidComposite = `${PUBKY_INVALID_TOO_LONG}:${POST_ID_STAGING_FIXTURE}`;
    render(<SinglePostPage postId={invalidComposite} />);

    expect(screen.getByTestId('post-not-found-discovery')).toBeInTheDocument();
    expect(usePostDetails).toHaveBeenCalledWith(invalidComposite, { enabled: false });
  });

  it('redirects collection-kind posts to the collections route without rendering content', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: { ...SHORT_POST_DETAILS, kind: 'collection' },
      isLoading: false,
    });

    render(<SinglePostPage postId={VALID_COMPOSITE_POST_ID} />);

    expect(replaceMock).toHaveBeenCalledWith(`/collections/${PUBKY_52_STAGING_FIXTURE}/${POST_ID_STAGING_FIXTURE}`);
    expect(screen.queryByTestId('single-post-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('single-post-content-skeleton')).toBeInTheDocument();
  });

  it('does not redirect non-collection posts', () => {
    render(<SinglePostPage postId={VALID_COMPOSITE_POST_ID} />);

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('single-post-content')).toBeInTheDocument();
  });
});
