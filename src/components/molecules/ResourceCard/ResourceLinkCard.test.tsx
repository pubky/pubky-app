import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { ResourceLinkCard } from './ResourceLinkCard';

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
  });

  it('shows the link’s preview in the card frame, with the host as its source', () => {
    render(<ResourceLinkCard url={URL} actions={<div data-testid="actions" />} />);

    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent('An article');
    expect(screen.getByTestId('resource-link-card-title')).toHaveAttribute('href', URL);
    expect(screen.getByTestId('resource-link-card-image')).toHaveAttribute('src', 'https://cdn.example.com/a.png');
    expect(screen.getByTestId('resource-card-source')).toHaveTextContent('example.com');
    expect(screen.getByTestId('resource-card-source')).toHaveAccessibleName('Open in example.com');
    expect(screen.getByTestId('resource-card-source')).not.toHaveTextContent('articles');
    expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', URL);
    expect(screen.queryByTestId('resource-card-type')).not.toBeInTheDocument();
    expect(screen.getByTestId('actions')).toBeInTheDocument();
  });

  it('titles the card with the link without its scheme when there is no preview', () => {
    mockUseOgMetadata.mockReturnValue({ metadata: null, isLoading: false, error: new Error('no preview') });

    render(<ResourceLinkCard url={URL} />);

    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent(
      'example.com/articles/a-long-path?ref=feed',
    );
  });

  it('is a click-through to the link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ResourceLinkCard url={URL} />);

    fireEvent.click(screen.getByTestId('resource-link-card'));

    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer');
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
});
