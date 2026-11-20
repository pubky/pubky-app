import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_FAB_CLEARANCE_CLASS } from '@/config/layoutClasses';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourcePage } from './ResourcePage';

const mocks = vi.hoisted(() => ({ PostPageLayout: vi.fn(), fetchCardByUri: vi.fn() }));

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => true }));
vi.mock('@/controllers/pinakes/pinakes', () => ({ PinakesController: { fetchCardByUri: mocks.fetchCardByUri } }));
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
    <div data-testid="resource-details-stub" data-uri={uri ?? 'none'} data-card={read.data?.id ?? 'none'}>
      {read.isError && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  ),
}));
vi.mock('@/organisms/ResourceDetails/ResourceSidebar', () => ({
  ResourceSidebar: ({ card }: { card: TPinakesResourceDetail | null | undefined }) =>
    card ? <div data-testid="resource-sidebar-stub">{card.id}</div> : null,
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

    expect(mockCard).toHaveBeenCalledWith(VIDEO.uri);
    const details = within(screen.getByTestId('post-page-layout')).getByTestId('resource-details-stub');
    expect(details).toHaveAttribute('data-uri', VIDEO.uri);
    expect(details).toHaveAttribute('data-card', VIDEO.id);
    expect(within(screen.getByTestId('right-sidebar')).getByTestId('resource-sidebar-stub')).toHaveTextContent(
      VIDEO.id,
    );
    expect(within(screen.getByTestId('right-drawer')).getByTestId('resource-sidebar-stub')).toBeInTheDocument();
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

  it.each([
    ['while the card is read', { data: undefined, isLoading: true, isError: false }],
    ['when there is no card', { data: null, isLoading: false, isError: false }],
    ['when the read failed', { data: null, isLoading: false, isError: true }],
  ])('keeps the right column empty and has no drawer or cards after the card %s', (_, result) => {
    mockCard.mockReturnValue(result);
    render(<ResourcePage uri={VIDEO.uri} />);

    expect(screen.getByTestId('right-sidebar')).toBeEmptyDOMElement();
    expect(mocks.PostPageLayout).toHaveBeenLastCalledWith(expect.objectContaining({ rightDrawerContent: null }));
    expect(screen.queryByTestId('resource-sidebar-inline')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-details-stub')).toBeInTheDocument();
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
    expect(screen.queryByTestId('resource-sidebar-stub')).not.toBeInTheDocument();

    await act(async () => fireEvent.click(retry));

    // The right column, the drawer and the cards after the card below `lg`.
    expect(await screen.findAllByTestId('resource-sidebar-stub')).toHaveLength(3);
    expect(screen.getByTestId('resource-details-stub')).toHaveAttribute('data-card', VIDEO.id);
    expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(2);
    expect(mocks.fetchCardByUri).toHaveBeenLastCalledWith({ uri: VIDEO.uri });
  });
});
