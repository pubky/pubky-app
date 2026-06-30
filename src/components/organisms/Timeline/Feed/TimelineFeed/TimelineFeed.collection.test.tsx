import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { buildCompositeId } from '@/models/models.utils';
import { buildCollectionItemsStreamId } from '@/models/stream/post/postStream.types';
import { TimelineFeed } from './TimelineFeed';

// Isolated test for the COLLECTION variant wrapper (`CollectionTimelineFeed`),
// which resolves its stream id from the `/collections/[userId]/[postId]` route
// params via `useParams()` (mirroring how `ProfileTimelineFeed` reads context).
// The broad `TimelineFeed.test.tsx` mocks `useParams` to a fixed value, so this
// lives in its own file where we can drive the params per-test.

const mockUseParams = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: vi.fn(
    (): FeedLayoutResolution => ({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isGridActive: true,
      isPhoneViewport: false,
    }),
  ),
}));

interface CapturedStreamProps {
  streamId: string | undefined;
  variant: string;
  tagsLayout: string;
  layoutResolution?: FeedLayoutResolution;
  collectionId?: string;
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
});
