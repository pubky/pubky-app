import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { buildCompositeId } from '@/models/models.utils';
import { buildCollectionItemsStreamId } from '@/models/stream/post/postStream.types';
import { LAYOUT } from '@/stores/home/home.types';
import { TimelineFeed } from './TimelineFeed';

// Isolated test for the COLLECTION variant wrapper (`CollectionTimelineFeed`),
// which resolves its stream id from the `/collections/[userId]/[postId]` route
// params via `useParams()` (mirroring how `ProfileTimelineFeed` reads context).
// The broad `TimelineFeed.test.tsx` mocks `useParams` to a fixed value, so this
// lives in its own file where we can drive the params per-test.

const mockUseParams = vi.hoisted(() => vi.fn());
const mockUseFeedLayoutResolution = vi.hoisted(() => vi.fn());
const mockAuthState = vi.hoisted(() => ({ currentUserPubky: null as string | null }));
const mockUsePostDetails = vi.hoisted(() =>
  vi.fn((): { postDetails: { content: string } | null | undefined; isLoading: boolean } => ({
    postDetails: undefined,
    isLoading: false,
  })),
);

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: mockUseFeedLayoutResolution,
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: mockUsePostDetails,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => selector(mockAuthState),
}));

const gridLayoutResolution = (): FeedLayoutResolution => ({
  requestedLayout: LAYOUT.COLUMNS,
  effectiveLayout: LAYOUT.COLUMNS,
  isVisualRequested: false,
  isVisualActive: false,
  isGridActive: true,
  isPhoneViewport: false,
});

interface CapturedStreamProps {
  streamId: string | undefined;
  variant: string;
  tagsLayout: string;
  layoutResolution?: FeedLayoutResolution;
  collectionId?: string;
  visualHiddenItemsNotice?: ReactNode;
  membershipPostIds?: string[];
}

const capturedProps: CapturedStreamProps[] = [];

vi.mock('../TimelineFeedContent/TimelineFeedContent', () => ({
  TimelineFeedWithStream: (props: CapturedStreamProps) => {
    capturedProps.push(props);
    return <div data-testid="feed-with-stream" data-stream-id={props.streamId ?? ''} />;
  },
}));

const lastProps = () => capturedProps[capturedProps.length - 1];

describe('CollectionTimelineFeed (COLLECTION variant)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFeedLayoutResolution.mockReturnValue(gridLayoutResolution());
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: false });
    mockAuthState.currentUserPubky = null;
    capturedProps.length = 0;
  });

  it('resolves the stream id from route params via buildCollectionItemsStreamId', () => {
    mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });

    render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

    const props = lastProps();
    expect(props.streamId).toBe(buildCollectionItemsStreamId('author-1', 'post-1'));
    expect(props.collectionId).toBe(buildCompositeId({ pubky: 'author-1', id: 'post-1' }));
    expect(props.variant).toBe(TIMELINE_FEED_VARIANT.COLLECTION);
    expect(props.tagsLayout).toBe('inline');
    expect(props.layoutResolution?.isGridActive).toBe(true);
  });

  it('leaves the stream id undefined until both params are present', () => {
    mockUseParams.mockReturnValue({ userId: 'author-1' });

    render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

    expect(lastProps().streamId).toBeUndefined();
  });

  it('leaves the stream id undefined when params are unavailable', () => {
    mockUseParams.mockReturnValue(null);

    render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

    expect(lastProps().streamId).toBeUndefined();
  });

  it('forwards the collection-scoped List selection and uses List post styling', () => {
    mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });
    mockUseFeedLayoutResolution.mockReturnValue({
      ...gridLayoutResolution(),
      requestedLayout: LAYOUT.LIST,
      effectiveLayout: LAYOUT.LIST,
      isGridActive: false,
    });

    render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} requestedLayout={LAYOUT.LIST} />);

    expect(mockUseFeedLayoutResolution).toHaveBeenCalledWith(TIMELINE_FEED_VARIANT.COLLECTION, LAYOUT.LIST);
    expect(lastProps().tagsLayout).toBe('list');
    expect(lastProps().layoutResolution?.isGridActive).toBe(false);
  });

  it('forwards the collection-scoped Visual selection and threads the hidden-items notice', () => {
    mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });
    mockUseFeedLayoutResolution.mockReturnValue({
      ...gridLayoutResolution(),
      requestedLayout: LAYOUT.VISUAL,
      effectiveLayout: LAYOUT.VISUAL,
      isVisualRequested: true,
      isVisualActive: true,
      isGridActive: false,
    });
    const notice = <div data-testid="hidden-items-notice" />;

    render(
      <TimelineFeed
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        requestedLayout={LAYOUT.VISUAL}
        visualHiddenItemsNotice={notice}
      />,
    );

    expect(mockUseFeedLayoutResolution).toHaveBeenCalledWith(TIMELINE_FEED_VARIANT.COLLECTION, LAYOUT.VISUAL);
    expect(lastProps().tagsLayout).toBe('inline');
    expect(lastProps().layoutResolution?.isVisualActive).toBe(true);
    expect(lastProps().visualHiddenItemsNotice).toBe(notice);
  });

  describe('membership sync', () => {
    const envelope = (items: string[]) => ({
      postDetails: { content: JSON.stringify({ name: 'Based Bitcoin', items }) },
      isLoading: false,
    });
    const uriFor = (pubky: string, postId: string) => `pubky://${pubky}/pub/pubky.app/posts/${postId}`;

    it('hands viewers the envelope membership as composite ids so the feed can mirror changes in place', () => {
      mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });
      mockAuthState.currentUserPubky = 'viewer-1';
      mockUsePostDetails.mockReturnValue(envelope([uriFor('author-2', 'item-b'), uriFor('author-1', 'item-a')]));

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

      expect(lastProps().membershipPostIds).toEqual(['author-2:item-b', 'author-1:item-a']);
    });

    it('leaves the membership undefined while the envelope is still resolving', () => {
      mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

      expect(lastProps().membershipPostIds).toBeUndefined();
    });

    it('does not hand the owner a membership (their own flows already update the feed)', () => {
      mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });
      mockAuthState.currentUserPubky = 'author-1';
      mockUsePostDetails.mockReturnValue(envelope([uriFor('author-1', 'item-a')]));

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

      expect(lastProps().membershipPostIds).toBeUndefined();
    });

    it('maps only well-formed item URIs, dropping duplicates', () => {
      mockUseParams.mockReturnValue({ userId: 'author-1', postId: 'post-1' });
      mockAuthState.currentUserPubky = 'viewer-1';
      mockUsePostDetails.mockReturnValue(
        envelope([uriFor('author-1', 'item-a'), 'https://example.com/not-a-post', uriFor('author-1', 'item-a')]),
      );

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />);

      expect(lastProps().membershipPostIds).toEqual(['author-1:item-a']);
    });
  });
});
