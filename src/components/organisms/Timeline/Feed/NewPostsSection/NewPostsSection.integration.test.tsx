import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { NewPostsSection } from './NewPostsSection';

const streamId: PostStreamId = PostStreamTypes.TIMELINE_ALL_ALL;

function post(id: string, indexed_at: number): PostDetailsModelSchema {
  return {
    id: buildCompositeId({ pubky: 'author', id }),
    indexed_at,
    kind: 'short',
    content: 'New post',
    uri: `pubky://author/pub/pubky.app/posts/${id}`,
    attachments: null,
  };
}

function Feed() {
  const { postIds, loading, prependPosts } = useStreamPagination({ streamId });
  return (
    <>
      <output data-testid="displayed-posts">{postIds.join(',')}</output>
      <NewPostsSection
        streamId={streamId}
        variant={TIMELINE_FEED_VARIANT.HOME}
        postIds={postIds}
        loading={loading}
        prependPosts={prependPosts}
        mutedUserIdSet={new Set()}
        mutedUsersLoading={false}
      />
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

it('keeps pending unread posts available after clicking a hydrated post', async () => {
  window.scrollTo = vi.fn();
  const now = Date.now();
  const existing = post('existing', now);
  const ready = post('ready', now + 2);
  const pending = post('pending', now + 1);
  await PostDetailsModel.create(existing);
  await PostStreamModel.upsert(streamId as PostStreamId, [existing.id]);
  vi.spyOn(StreamPostsController, 'getOrFetchStreamSlice').mockResolvedValue({
    nextPageIds: [existing.id],
    nextCursor: now,
    reachedEnd: true,
  });
  render(<Feed />);
  await waitFor(() => expect(screen.getByTestId('displayed-posts')).toHaveTextContent(existing.id));

  await act(async () => {
    await PostDetailsModel.create(ready);
    await UnreadPostStreamModel.upsert(streamId as PostStreamId, [ready.id, pending.id]);
  });
  const button = await screen.findByTestId('new-posts-button');
  expect(button).toHaveTextContent('See 1 new post');
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByTestId('displayed-posts')).toHaveTextContent(ready.id));

  expect((await StreamPostsController.getUnreadStream({ streamId }))?.stream).toEqual([pending.id]);
  expect((await PostStreamModel.findById(streamId as PostStreamId))?.stream).toEqual([ready.id, existing.id]);
  await act(async () => {
    await PostDetailsModel.create(pending);
  });
  fireEvent.click(await screen.findByTestId('new-posts-button'));
  await waitFor(() => expect(screen.getByTestId('displayed-posts')).toHaveTextContent(pending.id));
});
