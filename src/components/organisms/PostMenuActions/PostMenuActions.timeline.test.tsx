import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { LocksController } from '@/controllers/locks/locks';
import { PostController } from '@/controllers/post/post';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import type { TimelineFeedContextValue } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed.types';
import { TimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { PostMenuActions } from './PostMenuActions';

// The real useDeletePost and DialogConfirmDelete run here, inside a feed whose optimistic removal
// unmounts the row the way a timeline does, so the sign-in offer has to survive the feed (#2980).

const POST_ID = 'author:post-1';
const LOCK_URL = 'pubky://qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry/pub/app.locks/LOCK1.json';

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitDelete: vi.fn(),
    getDetails: vi.fn(),
    getDetailsByIds: vi.fn(),
  },
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    deleteLockContent: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    waitForAuth: async () => true,
    requireAuth: (action: () => void) => action(),
  }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: () => ({ postDetails: { kind: 'short', lock: LOCK_URL }, isLoading: false }),
}));

vi.mock('@/atoms/DropdownMenu/DropdownMenu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/atoms/Dialog/Dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog-confirm-delete">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/organisms/DialogEditPost/DialogEditPost', () => ({ DialogEditPost: () => null }));
vi.mock('@/organisms/DialogReportPost/DialogReportPost', () => ({ DialogReportPost: () => null }));
vi.mock('@/organisms/Collections/DialogEditCollection/DialogEditCollection', () => ({
  DialogEditCollection: () => null,
}));

vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({
  DialogLocksAuth: ({ open, mode, onSuccess }: { open: boolean; mode?: string; onSuccess: () => void }) =>
    open ? (
      <div data-testid="dialog-locks-auth" data-mode={mode}>
        <button onClick={onSuccess}>Locks Continue</button>
      </div>
    ) : null,
}));

vi.mock('./PostMenuActionsContent/PostMenuActionsContent', () => ({
  PostMenuActionsContent: ({ onDeleteClick }: { onDeleteClick?: () => void }) => (
    <button onClick={onDeleteClick}>Open delete</button>
  ),
}));

const removal = { commit: vi.fn(), rollback: vi.fn() };
const removePostsOptimistically = vi.fn();

/** A feed that unmounts a row while its optimistic removal is open, and mounts a fresh one on rollback. */
function Feed() {
  const [hidden, setHidden] = useState(false);
  const [generation, setGeneration] = useState(0);
  const value: TimelineFeedContextValue = {
    variant: TIMELINE_FEED_VARIANT.HOME,
    streamId: PostStreamTypes.TIMELINE_ALL_ALL,
    prependPosts: vi.fn(async () => {}),
    prependOptimisticPosts: vi.fn(),
    removePosts: vi.fn(() => setHidden(true)),
    removePostsOptimistically: (ids) => {
      removePostsOptimistically(ids);
      setHidden(true);
      return {
        commit: () => removal.commit(),
        rollback: () => {
          removal.rollback();
          setHidden(false);
          setGeneration((g) => g + 1);
        },
      };
    },
  };
  return (
    <TimelineFeedContext.Provider value={value}>
      {hidden ? null : (
        <div data-testid="feed-row" key={generation}>
          <PostMenuActions postId={POST_ID} trigger={<button>Menu</button>} />
        </div>
      )}
    </TimelineFeedContext.Provider>
  );
}

describe('PostMenuActions on a timeline, deleting a lock announcement (#2980)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([
      { id: POST_ID, content: '{}', lock: LOCK_URL } as never,
    ]);
    vi.mocked(PostController.getDetails).mockResolvedValue({ id: POST_ID, content: '{}', lock: LOCK_URL } as never);
    vi.mocked(PostController.commitDelete).mockResolvedValue(undefined);
  });

  it('keeps the row and the Sign in offer when the Lock Server needs a sign-in, then removes and commits on retry', async () => {
    vi.mocked(LocksController.deleteLockContent)
      .mockRejectedValueOnce(
        Err.auth(AuthErrorCode.SESSION_EXPIRED, 'rejected', { service: ErrorService.Locks, operation: 'test' }),
      )
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<Feed />);

    await user.click(screen.getByRole('button', { name: 'Open delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.getByText('Sign in to the Lock Server to delete this post.')).toBeInTheDocument(),
    );
    expect(removePostsOptimistically).not.toHaveBeenCalled();
    expect(PostController.commitDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId('feed-row')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-confirm-delete')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByTestId('dialog-locks-auth')).toHaveAttribute('data-mode', 'signin');
    await user.click(screen.getByRole('button', { name: 'Locks Continue' }));

    await waitFor(() => expect(PostController.commitDelete).toHaveBeenCalledWith({ compositePostId: POST_ID }));
    expect(LocksController.deleteLockContent).toHaveBeenCalledTimes(2);
    expect(removePostsOptimistically).toHaveBeenCalledWith(POST_ID);
    expect(vi.mocked(LocksController.deleteLockContent).mock.invocationCallOrder[1]).toBeLessThan(
      removePostsOptimistically.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(removal.commit).toHaveBeenCalledTimes(1));
    expect(removal.rollback).not.toHaveBeenCalled();
    expect(screen.queryByTestId('feed-row')).not.toBeInTheDocument();
  });
});
