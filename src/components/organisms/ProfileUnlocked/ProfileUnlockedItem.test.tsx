import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedPost } from '@/services/locks/locks.types';
import { ProfileUnlockedItem } from './ProfileUnlockedItem';

// The fallback card renders through PostBody → PostText, which reads the route to decide truncation.
vi.mock('next/navigation', () => ({ usePathname: () => '/profile/unlocked' }));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchReplicatedAttachments: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/organisms/PostMain/PostMain', () => ({
  PostMain: ({ postId }: { postId: string }) => <div data-testid="post-main">{postId}</div>,
}));

// Mocked one level below `usePostMissing` so the real "invalid id settles as missing" rule is tested.
type PostDetailsStub = { postDetails?: { content: string } | null; isLoading: boolean };
const postDetails = vi.hoisted<{ value: PostDetailsStub }>(() => ({
  value: { postDetails: undefined, isLoading: true },
}));
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: () => postDetails.value,
}));

// `usePostMissing` rejects an author that is not a 52-char pubky, which would read as "missing".
const POST_ID = 'abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijkl:POST1';
const post: ReplicatedPost = { content: 'unlocked body', kind: 'short', attachments: null };

describe('ProfileUnlockedItem', () => {
  beforeEach(() => {
    postDetails.value = { postDetails: undefined, isLoading: true };
  });

  it('falls back to the replica when the marker recorded no announcement', () => {
    render(<ProfileUnlockedItem post={post} />);

    expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
    expect(screen.getByText('unlocked body')).toBeInTheDocument();
  });

  it('falls back to the replica when the announcement post cannot be found', () => {
    postDetails.value = { postDetails: null, isLoading: false };

    render(<ProfileUnlockedItem post={post} announcementPostId={POST_ID} />);

    expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
    expect(screen.getByText('unlocked body')).toBeInTheDocument();
  });

  it('falls back to the replica when the announcement post was deleted', () => {
    postDetails.value = { postDetails: { content: '[DELETED]' }, isLoading: false };

    render(<ProfileUnlockedItem post={post} announcementPostId={POST_ID} />);

    expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
    expect(screen.getByText('unlocked body')).toBeInTheDocument();
  });

  it('renders the announcement post once it resolves', () => {
    postDetails.value = { postDetails: { content: 'teaser' }, isLoading: false };

    render(<ProfileUnlockedItem post={post} announcementPostId={POST_ID} />);

    expect(screen.getByTestId('post-main')).toHaveTextContent(POST_ID);
  });

  it('holds a skeleton while the announcement loads, so the row fetches it once', () => {
    render(<ProfileUnlockedItem post={post} announcementPostId={POST_ID} />);

    // `PostMain` runs the same query; mounting it here would double the request for one row.
    expect(screen.queryByTestId('post-main')).not.toBeInTheDocument();
    expect(screen.queryByText('unlocked body')).not.toBeInTheDocument();
  });
});
