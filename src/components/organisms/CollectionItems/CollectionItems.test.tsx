import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { asOpaque } from '@/test-utils/type-assertions';
import { CollectionItems } from './CollectionItems';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuthStore = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant }: { variant: string }) => <div data-testid="timeline-feed" data-variant={variant} />,
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
const COMPOSITE_ID = `${AUTHOR_PUBKY}:${POST_ID}`;

const COLLECTION_CONTENT = JSON.stringify({
  name: 'Based Bitcoin',
  description: 'A bit of Bitcoin purity amidst all of the madness.',
  items: ['pubky://author/pub/pubky.app/posts/a', 'pubky://author/pub/pubky.app/posts/b'],
});

const COLLECTION_CONTENT_EMPTY = JSON.stringify({
  name: 'Quiet collection',
  description: null,
  items: [],
});

const mockUsePostDetails = vi.mocked(usePostDetails);

function setAuthStore(currentUserPubky: string | null) {
  mockUseAuthStore.mockImplementation((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky }),
  );
}

function setPostDetails(content: string | null) {
  mockUsePostDetails.mockReturnValue({
    postDetails: content
      ? asOpaque<EnrichedPostDetails>({
          id: COMPOSITE_ID,
          content,
          kind: 'collection',
          indexed_at: 0,
          uri: '',
          attachments: null,
          is_moderated: false,
          is_blurred: false,
        })
      : null,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthStore(null);
  setPostDetails(COLLECTION_CONTENT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionItems', () => {
  it('renders the COLLECTION TimelineFeed for a non-empty envelope and no empty state', () => {
    setPostDetails(COLLECTION_CONTENT);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    const feed = screen.getByTestId('timeline-feed');
    expect(feed).toHaveAttribute('data-variant', 'collection');
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('renders the feed (never the empty state) while the envelope is still loading', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: true });

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'collection');
    expect(screen.queryByTestId('collection-items-empty')).not.toBeInTheDocument();
  });

  it('renders the owner Add Content CTA (and no feed) for an empty envelope owned by the viewer', () => {
    setAuthStore(AUTHOR_PUBKY);
    setPostDetails(COLLECTION_CONTENT_EMPTY);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByLabelText('collections.single.addContent')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });

  it('renders plain empty text (and no Add Content CTA) for an empty envelope viewed by a non-owner', () => {
    setAuthStore('some-other-user');
    setPostDetails(COLLECTION_CONTENT_EMPTY);

    render(<CollectionItems authorPubky={AUTHOR_PUBKY} postId={POST_ID} />);

    expect(screen.getByText('collections.single.empty')).toBeInTheDocument();
    expect(screen.queryByLabelText('collections.single.addContent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });
});
