import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { ResourceItem } from './ResourceItem';

const mocks = vi.hoisted(() => ({ card: vi.fn() }));

vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: mocks.card }));
// The card a post shows for a link has its own tests: here only which item gets one matters.
vi.mock('@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview', async () => {
  const { useResourceSurface } = await import('@/molecules/ResourceCard/ResourceSurfaceContext');
  function GenericResourcePreview({ url }: { url: string }) {
    return <div data-testid="preview" data-url={url} data-surface={useResourceSurface()} />;
  }
  return { GenericResourcePreview };
});

const DECK =
  'pubky://1kzgu8sshfqyaqqbm8hkxww18juw6mms8rszs1e8hrg8sy4uasio/pub/loopky/decks/english3000-ha/manifest.json';
const NOTHING = { data: null, isLoading: false, isError: false };

describe('ResourceItem', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    mocks.card.mockReset();
    mocks.card.mockReturnValue(NOTHING);
  });

  it('shows a web link as the card a post shows for it, with no read of its own', () => {
    render(<ResourceItem uri="https://example.com/a" data-testid="item" />);

    expect(screen.getByTestId('preview')).toHaveAttribute('data-url', 'https://example.com/a');
    expect(screen.getByTestId('preview')).toHaveAttribute('data-surface', 'card');
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
    expect(mocks.card).toHaveBeenCalledWith(null);
  });

  it('shows a Pubky object Pinakes has a card for as that card, never as its path', () => {
    mocks.card.mockReturnValue({
      data: { uri: DECK, name: 'Turanci: kalmomi da jimloli 3,000 mafi amfani', site: 'loopky' },
      isLoading: false,
      isError: false,
    });
    render(<ResourceItem uri={DECK} data-testid="item" />);

    expect(mocks.card).toHaveBeenCalledWith(DECK);
    expect(screen.getByTestId('preview')).toHaveAttribute('data-url', DECK);
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
    expect(screen.queryByText(/manifest\.json/i)).not.toBeInTheDocument();
  });

  it('holds the card’s place while Pinakes is read, and gives way to the row when the read is slow', () => {
    vi.useFakeTimers();
    mocks.card.mockReturnValue({ data: null, isLoading: true, isError: false });
    render(<ResourceItem uri={DECK} data-testid="item" />);

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(PINAKES_SLOW_READ_MS));
    expect(screen.getByRole('link').textContent).toBe('loopky');
  });

  it('keeps the row for a failed read and for a card with no name', () => {
    mocks.card.mockReturnValue({ data: null, isLoading: false, isError: true });
    const { rerender } = render(<ResourceItem uri={DECK} data-testid="item" />);
    expect(screen.getByRole('link').textContent).toBe('loopky');

    mocks.card.mockReturnValue({ data: { uri: DECK, name: ' ', site: 'loopky' }, isLoading: false, isError: false });
    rerender(<ResourceItem uri={DECK} data-testid="item" />);
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(screen.getByRole('link').textContent).toBe('loopky');
  });

  it('shows no row while Pinakes is read', () => {
    mocks.card.mockReturnValue({ data: null, isLoading: true, isError: false });
    render(<ResourceItem uri={DECK} data-testid="item" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
  });

  it('names a Pubky object Pinakes does not know by its app, in a row opening its page', () => {
    render(<ResourceItem uri={DECK} data-testid="item" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', getResourceRoute(DECK));
    expect(link.textContent).toBe('loopky');
    expect(screen.getByTestId('item')).toHaveClass('bg-card', 'rounded-md', 'p-4');
  });

  it('shows an identifier once in its row, not again as a note', () => {
    render(<ResourceItem uri="isbn:9780140328721" />);

    expect(mocks.card).toHaveBeenCalledWith('isbn:9780140328721');
    expect(screen.getByRole('link').textContent).toBe('9780140328721');
  });

  it('never asks Pinakes about a URI no post may name', () => {
    render(<ResourceItem uri="javascript:alert(1)" />);

    expect(mocks.card).toHaveBeenCalledWith(null);
    expect(screen.getByRole('link')).toHaveAttribute('href', getResourceRoute('javascript:alert(1)'));
  });
});
