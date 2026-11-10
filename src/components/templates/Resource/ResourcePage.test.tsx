import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_FAB_CLEARANCE_CLASS } from '@/config/layoutClasses';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourcePage } from './ResourcePage';

const mocks = vi.hoisted(() => ({
  PostPageLayout: vi.fn(),
  fetchCardByUri: vi.fn(),
  resolveCard: vi.fn(),
  repliesUri: undefined as string | null | undefined,
  repliesSpellings: undefined as readonly string[] | undefined,
}));

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => true }));
vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: { fetchCardByUri: mocks.fetchCardByUri, resolveCard: mocks.resolveCard },
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: vi.fn() }));
vi.mock('@/organisms/PostPageShell/PostPageLayout', () => ({
  PostPageLayout: ({
    children,
    rightSidebarContent,
    rightDrawerContent,
    showRightMobileButton,
    className,
  }: {
    children: ReactNode;
    rightSidebarContent: ReactNode;
    rightDrawerContent: ReactNode;
    showRightMobileButton?: boolean;
    className?: string;
  }) => {
    mocks.PostPageLayout({ rightDrawerContent, showRightMobileButton, className });
    return (
      <div data-testid="post-page-layout">
        <div data-testid="right-sidebar">{rightSidebarContent}</div>
        {rightDrawerContent && <div data-testid="right-drawer">{rightDrawerContent}</div>}
        {children}
      </div>
    );
  },
}));
vi.mock('@/organisms/ResourceDetails/ResourceDetails', () => ({
  ResourceDetails: ({
    uri,
    read,
    onRetry,
  }: {
    uri: string | null;
    read: UsePinakesQueryResult<TPinakesResourceDetail>;
    onRetry: () => void;
  }) => (
    <div
      data-testid="resource-details-stub"
      data-uri={uri ?? 'none'}
      data-card={read.data?.id ?? 'none'}
      data-loading={String(read.isLoading)}
    >
      {read.isError && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  ),
}));
vi.mock('@/hooks/useResourceReplies/useResourceReplies', () => ({
  useResourceReplies: (uri: string | null, options?: { spellings?: readonly string[] }) => {
    mocks.repliesUri = uri;
    mocks.repliesSpellings = options?.spellings;
    return { replyIds: uri ? ['replier:1'] : [] };
  },
}));
vi.mock('@/organisms/ResourceDetails/ResourceSidebar', () => ({
  ResourceSidebar: ({
    card,
    uri,
    spellings,
    replyIds,
    showFeedback,
  }: {
    card: TPinakesResourceDetail | null | undefined;
    uri?: string | null;
    spellings?: readonly string[];
    replyIds?: string[];
    showFeedback?: boolean;
  }) =>
    card || uri ? (
      <div
        data-testid="resource-sidebar-stub"
        data-people={uri ?? ''}
        data-spellings={(spellings ?? []).join(' ')}
        data-replies={(replyIds ?? []).join(' ')}
        data-feedback={String(Boolean(showFeedback))}
      >
        {card?.id ?? ''}
      </div>
    ) : null,
}));

const VIDEO: TPinakesResourceDetail = videoFixture;

describe('ResourcePage', () => {
  const mockCard = vi.mocked(usePinakesCard);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCard.mockReturnValue({ data: VIDEO, isLoading: false, isError: false });
  });

  it('lays the page out as a post’s page: the card’s read in the body, its sidebar cards on the right and in the drawer', () => {
    render(<ResourcePage uri={VIDEO.uri} />);

    // A link Pinakes does not know is sent to be read; a pending card is read again (`usePinakesCard`).
    expect(mockCard).toHaveBeenCalledWith(VIDEO.uri, { resolve: true, recheck: true });
    const details = within(screen.getByTestId('post-page-layout')).getByTestId('resource-details-stub');
    expect(details).toHaveAttribute('data-uri', VIDEO.uri);
    expect(details).toHaveAttribute('data-card', VIDEO.id);
    expect(within(screen.getByTestId('right-sidebar')).getByTestId('resource-sidebar-stub')).toHaveTextContent(
      VIDEO.id,
    );
    const drawer = within(screen.getByTestId('right-drawer')).getByTestId('resource-sidebar-stub');
    // Participants follow the page's link; the Feedback card only in the right column, as on a post's page.
    expect(within(screen.getByTestId('right-sidebar')).getByTestId('resource-sidebar-stub')).toHaveAttribute(
      'data-feedback',
      'true',
    );
    // One read of the thread, on the card's canonical link, for the body and the Participants.
    expect(mocks.repliesUri).toBe(VIDEO.uri);
    expect(drawer).toHaveAttribute('data-people', VIDEO.uri);
    expect(drawer).toHaveAttribute('data-replies', 'replier:1');
    expect(drawer).toHaveAttribute('data-feedback', 'false');
  });

  it('shows the sidebar cards after the card below `lg`, not behind the mobile header’s button', () => {
    render(<ResourcePage uri={VIDEO.uri} />);

    const inline = screen.getByTestId('resource-sidebar-inline');
    expect(inline).toHaveClass('lg:hidden');
    expect(within(inline).getByTestId('resource-sidebar-stub')).toHaveTextContent(VIDEO.id);
    expect(screen.getByTestId('resource-details-stub').compareDocumentPosition(inline)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(mocks.PostPageLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({ showRightMobileButton: false, className: `${MOBILE_FAB_CLEARANCE_CLASS} lg:pb-12` }),
    );
  });

  it('keeps the right column empty and reads no thread while the card is read', () => {
    mockCard.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ResourcePage uri={VIDEO.uri} />);

    expect(screen.getByTestId('right-sidebar')).toBeEmptyDOMElement();
    expect(mocks.PostPageLayout).toHaveBeenLastCalledWith(expect.objectContaining({ rightDrawerContent: null }));
    expect(screen.queryByTestId('resource-sidebar-inline')).not.toBeInTheDocument();
    expect(mocks.repliesUri).toBeNull();
  });

  it('shows the link, its thread and Participants at once while Pinakes is asked to read it', () => {
    mockCard.mockReturnValue({ data: null, isLoading: false, isError: false, isResolving: true });
    render(<ResourcePage uri={VIDEO.uri} />);

    expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-loading', 'false');
    expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-card', 'none');
    expect(mocks.repliesUri).toBe(VIDEO.uri);
    expect(within(screen.getByTestId('right-sidebar')).getByTestId('resource-sidebar-stub')).toHaveAttribute(
      'data-people',
      VIDEO.uri,
    );
  });

  describe('a link Pinakes does not know (the real card read)', () => {
    let resolveDebounceMs = 0;
    const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    beforeEach(async () => {
      const actual = await vi.importActual<typeof import('@/hooks/usePinakesCard/usePinakesCard')>(
        '@/hooks/usePinakesCard/usePinakesCard',
      );
      resolveDebounceMs = actual.PINAKES_RESOLVE_DEBOUNCE_MS;
      mockCard.mockImplementation(actual.usePinakesCard);
      mocks.fetchCardByUri.mockResolvedValue(null);
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('has Pinakes read it once on opening the page, showing the link meanwhile, then the card it read', async () => {
      const uri = 'https://tidal.com/artist/7429906';
      let answer: (card: TPinakesResourceDetail) => void = () => {};
      mocks.resolveCard.mockReturnValue(new Promise<TPinakesResourceDetail>((resolve) => (answer = resolve)));
      render(<ResourcePage uri={uri} />);
      await advance(0);
      await advance(resolveDebounceMs);

      // While Pinakes reads it, after its 404: the link without a card, its thread on the link as written.
      expect(mocks.fetchCardByUri).toHaveBeenCalledWith({ uri });
      expect(mocks.resolveCard).toHaveBeenCalledWith({ uri });
      expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-loading', 'false');
      expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-card', 'none');
      expect(mocks.repliesUri).toBe(uri);

      await act(async () => answer({ ...VIDEO, id: 'read-on-open', uri }));
      expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-card', 'read-on-open');
      expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-loading', 'false');
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
      expect(mocks.repliesUri).toBe(uri);
    });

    it('shows the page without a card, the thread on the link as written, when Pinakes would not read it', async () => {
      // Pinakes refuses some links (400), or is over its budget (429, 503): `resolveCard` answers null.
      const uri = 'https://example.com/refused';
      mocks.resolveCard.mockResolvedValue(null);
      render(<ResourcePage uri={uri} />);
      await advance(0);
      await advance(resolveDebounceMs);
      await advance(0);

      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
      expect(mocks.resolveCard).toHaveBeenCalledWith({ uri });
      expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-loading', 'false');
      expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-card', 'none');
      expect(mocks.repliesUri).toBe(uri);
      expect(within(screen.getByTestId('right-sidebar')).getByTestId('resource-sidebar-stub')).toHaveAttribute(
        'data-people',
        uri,
      );
    });
  });

  it.each([
    ['when there is no card', { data: null, isLoading: false, isError: false }],
    ['when the read failed', { data: null, isLoading: false, isError: true }],
  ])('shows only the people sections, on the page’s link, %s', (_, result) => {
    mockCard.mockReturnValue(result);
    render(<ResourcePage uri={VIDEO.uri} />);

    const right = within(screen.getByTestId('right-sidebar')).getByTestId('resource-sidebar-stub');
    expect(right).toHaveTextContent('');
    expect(right).toHaveAttribute('data-people', VIDEO.uri);
    // Also below `lg`, where the drawer has no button.
    expect(
      within(screen.getByTestId('resource-sidebar-inline')).getByTestId('resource-sidebar-stub'),
    ).toHaveTextContent('');
    expect(screen.getByTestId('resource-details-stub')).toBeInTheDocument();
  });

  it('reads the thread on the card’s canonical link, with the page’s link and the card’s other spellings', () => {
    const share = 'https://youtu.be/dQw4w9WgXcQ';
    mockCard.mockReturnValue({ data: { ...VIDEO, refs: [share] }, isLoading: false, isError: false });
    render(<ResourcePage uri={share} />);

    expect(mocks.repliesUri).toBe(VIDEO.uri);
    expect(mocks.repliesSpellings).toEqual([share]);
    const drawer = within(screen.getByTestId('right-drawer')).getByTestId('resource-sidebar-stub');
    expect(drawer).toHaveAttribute('data-people', VIDEO.uri);
    expect(drawer).toHaveAttribute('data-spellings', share);
  });

  it('names the tab after the resource, and gives the route’s title back on leaving', () => {
    document.title = 'External resource - Pubky App';
    const { unmount } = render(<ResourcePage uri={VIDEO.uri} />);

    expect(document.title).toBe(`${VIDEO.name} - Pubky App`);
    unmount();
    expect(document.title).toBe('External resource - Pubky App');
  });

  it('keeps the title the next page set before it left', () => {
    const { unmount } = render(<ResourcePage uri={VIDEO.uri} />);

    document.title = 'Home - Pubky App';
    unmount();
    expect(document.title).toBe('Home - Pubky App');
  });

  it('reads the card again on Try again, for the body and the sidebar cards alike', async () => {
    // The real hook over a mocked controller: a retry has to start a new read, not re-render the old one.
    const actual = await vi.importActual<typeof import('@/hooks/usePinakesCard/usePinakesCard')>(
      '@/hooks/usePinakesCard/usePinakesCard',
    );
    mockCard.mockImplementation(actual.usePinakesCard);
    mocks.fetchCardByUri.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(VIDEO);
    render(<ResourcePage uri={VIDEO.uri} />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText(VIDEO.id)).not.toBeInTheDocument();

    await act(async () => fireEvent.click(retry));

    // The right column, the drawer and the cards after the card below `lg`.
    expect(await screen.findAllByTestId('resource-sidebar-stub')).toHaveLength(3);
    expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-card', VIDEO.id);
    expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(2);
    expect(mocks.fetchCardByUri).toHaveBeenLastCalledWith({ uri: VIDEO.uri });
  });
});
