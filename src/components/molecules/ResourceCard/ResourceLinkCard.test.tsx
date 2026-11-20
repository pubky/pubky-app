import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceLinkCard } from './ResourceLinkCard';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({ useOgMetadata: vi.fn() }));

const URL = 'https://www.example.com/articles/a-long-path?ref=feed';

describe('ResourceLinkCard', () => {
  const mockUseOgMetadata = vi.mocked(useOgMetadata);

  beforeEach(() => {
    mockUseOgMetadata.mockReturnValue({
      metadata: { url: 'example.com', title: 'An article', image: 'https://cdn.example.com/a.png', type: 'website' },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockPush.mockClear();
  });

  it('shows the link’s preview in the card frame, with the host as its source', () => {
    render(<ResourceLinkCard url={URL} actions={<div data-testid="actions" />} />);

    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent('An article');
    // The title opens the resource's page, the site link the link itself in a new tab.
    expect(screen.getByTestId('resource-link-card-title')).toHaveAttribute('href', getResourceRoute(URL));
    expect(screen.getByTestId('resource-link-card-title')).not.toHaveAttribute('target');
    expect(screen.getByTestId('resource-card-source')).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('resource-link-card-image')).toHaveAttribute('src', 'https://cdn.example.com/a.png');
    expect(screen.getByTestId('resource-card-source')).toHaveTextContent('example.com');
    expect(screen.getByTestId('resource-card-source')).toHaveAccessibleName('Open in example.com');
    expect(screen.getByTestId('resource-card-source')).not.toHaveTextContent('articles');
    expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', URL);
    expect(screen.queryByTestId('resource-card-type')).not.toBeInTheDocument();
    expect(screen.getByTestId('actions')).toBeInTheDocument();
  });

  it('opens the resource page in a new tab from the title where links may not navigate (the composer)', () => {
    render(
      <PostPreviewNavigableProvider navigable={false}>
        <ResourceLinkCard url={URL} />
      </PostPreviewNavigableProvider>,
    );

    const title = screen.getByTestId('resource-link-card-title');
    expect(title).toHaveAttribute('href', getResourceRoute(URL));
    expect(title).toHaveAttribute('target', '_blank');
    expect(title).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('titles the card with the link without its scheme when there is no preview', () => {
    mockUseOgMetadata.mockReturnValue({ metadata: null, isLoading: false, error: new Error('no preview') });

    render(<ResourceLinkCard url={URL} />);

    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent(
      'example.com/articles/a-long-path?ref=feed',
    );
  });

  it('opens the link’s resource page on a click on the card: only its source opens the link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ResourceLinkCard url={URL} />);

    fireEvent.click(screen.getByTestId('resource-link-card-image'));
    fireEvent.click(screen.getByTestId('resource-link-card'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith(getResourceRoute(URL));
    expect(open).not.toHaveBeenCalled();
  });

  it('shows the frame skeleton while the preview loads', () => {
    mockUseOgMetadata.mockReturnValue({ metadata: null, isLoading: true, error: null });

    render(<ResourceLinkCard url={URL} actions={<div />} />);

    expect(screen.getByTestId('resource-card-skeleton-actions')).toBeInTheDocument();
  });

  it('keeps the inline player for a link the preview reads as a media file', () => {
    mockUseOgMetadata.mockReturnValue({
      metadata: { url: URL, title: null, image: null, type: 'audio' },
      isLoading: false,
      error: null,
    });

    render(<ResourceLinkCard url={URL} actions={<div data-testid="actions" />} />);

    expect(screen.queryByTestId('resource-link-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('actions')).not.toBeInTheDocument();
  });

  describe('large, atop the link’s resource page', () => {
    it('makes the title the page’s heading and the source “Open in”, with no click-through to the same page', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceLinkCard url={URL} size="large" actions={<div data-testid="actions" />} />);

      const card = screen.getByTestId('resource-link-card');
      expect(card).toHaveAttribute('data-size', 'large');
      expect(card).not.toHaveAttribute('data-click-through');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('An article');
      expect(screen.getByTestId('resource-link-card-title')).not.toHaveAttribute('href');
      expect(screen.getByTestId('resource-card-source').textContent).toBe('example.com');
      expect(screen.getByTestId('resource-card-source')).toHaveAccessibleName('Open in example.com');
      expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', URL);
      expect(screen.getByTestId('actions')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('resource-link-card-image'));
      fireEvent.click(card);

      expect(mockPush).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    });

    it('shows the large skeleton while the preview loads, with the link, its site and the footer', () => {
      mockUseOgMetadata.mockReturnValue({ metadata: null, isLoading: true, error: null });

      render(<ResourceLinkCard url={URL} size="large" actions={<div data-testid="actions" />} />);

      expect(screen.getByTestId('resource-card-skeleton')).toHaveAttribute('data-size', 'large');
      expect(screen.getByTestId('resource-card-skeleton-title')).toHaveAttribute('title', URL);
      expect(screen.getByRole('status')).toHaveTextContent('Loading details...');
      expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', URL);
      expect(screen.getByTestId('actions')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-skeleton-actions')).not.toBeInTheDocument();
    });

    it('keeps the frame and its footer for a link the preview reads as a media file', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: { url: URL, title: null, image: null, type: 'audio' },
        isLoading: false,
        error: null,
      });

      render(<ResourceLinkCard url={URL} size="large" actions={<div data-testid="actions" />} />);

      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(screen.getByTestId('actions')).toBeInTheDocument();
    });
  });

  it('titles a link that is not web with the link as written, as text, and reads no preview for it', () => {
    // What the preview answers when it is asked for nothing.
    mockUseOgMetadata.mockReturnValue({ metadata: null, isLoading: false, error: null });
    render(<ResourceLinkCard url="isbn:9780000000002" size="large" actions={<div />} />);

    expect(mockUseOgMetadata).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent('isbn:9780000000002');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
