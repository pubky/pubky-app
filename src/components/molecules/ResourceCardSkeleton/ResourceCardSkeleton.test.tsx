import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from './ResourceCardSkeleton';

const LONG_LINK = 'btc:block/00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054';

describe('ResourceCardSkeleton', () => {
  it('renders the card outline from skeleton blocks', () => {
    render(<ResourceCardSkeleton />);

    const skeleton = screen.getByTestId('resource-card-skeleton');
    expect(skeleton.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('holds the place of the bottom zone only when asked, as one part', () => {
    const { rerender } = render(<ResourceCardSkeleton />);
    expect(screen.queryByTestId('resource-card-skeleton-actions')).not.toBeInTheDocument();

    rerender(<ResourceCardSkeleton withActions />);
    expect(screen.getByTestId('resource-card-skeleton-actions')).toBeInTheDocument();
    // One bottom zone: the frame has two parts.
    expect(screen.getByTestId('resource-card-skeleton').children).toHaveLength(2);
  });

  it('lays the bottom zone out like the footer: stacked in a grid cell, one counted button', () => {
    render(<ResourceCardSkeleton withActions />);

    const zone = screen.getByTestId('resource-card-skeleton-actions');
    expect(zone).toHaveClass('md:flex-row', '@max-xl/grid:flex-col!', '@max-xl/grid:items-start!');
    const buttons = zone.lastElementChild?.children ?? [];
    expect(Array.from(buttons).map((button) => button.classList.contains('w-12'))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('fills the button placeholders with the card colour, so they show on the card’s muted surface', () => {
    render(<ResourceCardSkeleton withActions />);

    const buttons = screen.getByTestId('resource-card-skeleton-actions').lastElementChild?.children ?? [];
    expect(buttons).toHaveLength(5);
    for (const button of Array.from(buttons)) {
      expect(button).toHaveClass('bg-card');
      expect(button).not.toHaveClass('bg-muted');
    }
  });

  it('keeps the large card’s button placeholders muted, so they show on its card surface', () => {
    render(<ResourceCardSkeleton withActions size="large" />);

    const buttons = screen.getByTestId('resource-card-skeleton-actions').lastElementChild?.children ?? [];
    expect(buttons).toHaveLength(5);
    for (const button of Array.from(buttons)) {
      expect(button).toHaveClass('bg-muted');
      expect(button).not.toHaveClass('bg-card');
    }
  });

  it('mirrors the large card’s surface when large', () => {
    const { rerender } = render(<ResourceCardSkeleton withActions />);
    const skeleton = screen.getByTestId('resource-card-skeleton');
    expect(skeleton).toHaveAttribute('data-size', 'default');
    expect(skeleton).toHaveClass('bg-embed');

    rerender(<ResourceCardSkeleton withActions size="large" />);
    expect(skeleton).toHaveAttribute('data-size', 'large');
    expect(skeleton).toHaveClass('bg-card');
    expect(skeleton).not.toHaveClass('bg-embed');
  });

  describe('given the link being read', () => {
    it('shows the link as the title, shortened, the full link in its tooltip, and says the rest is loading', () => {
      render(<ResourceCardSkeleton size="large" link={LONG_LINK} />);

      const title = screen.getByTestId('resource-card-skeleton-title');
      expect(title.tagName).toBe('H2');
      expect(title).toHaveTextContent('btc:block/0000...7a8d72728a054');
      expect(title).toHaveAttribute('title', LONG_LINK);
      expect(title).toHaveClass('text-xl', 'font-bold', 'wrap-anywhere', 'text-foreground', 'sm:text-2xl');
      expect(screen.getByRole('status')).toHaveTextContent('Loading details...');
      // The image and the two description lines stay skeletons; a link that is not web has no site.
      expect(screen.queryByTestId('resource-card-source')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-skeleton').querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
    });

    it('keeps a short link whole and names a web link’s site in the header, as its preview does', () => {
      render(<ResourceCardSkeleton size="large" link="https://www.example.com/a" />);

      expect(screen.getByTestId('resource-card-skeleton-title').textContent).toBe('example.com/a');
      const source = screen.getByTestId('resource-card-source');
      expect(source).toHaveAttribute('href', 'https://www.example.com/a');
      expect(source).toHaveAccessibleName('Open in example.com');
      // Only the image and the two description lines are left to load.
      expect(screen.getByTestId('resource-card-skeleton').querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    });
  });

  it('shows the given footer in place of the bottom zone’s skeleton', () => {
    render(<ResourceCardSkeleton withActions size="large" actions={<div data-testid="real-actions" />} />);

    expect(screen.getByTestId('real-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-skeleton-actions')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-card-skeleton').children).toHaveLength(2);
  });

  it('takes the large card’s surface and placeholders, at the normal size, for a card that is the item itself', () => {
    render(
      <ResourceSurfaceProvider surface="card">
        <ResourceCardSkeleton withActions />
      </ResourceSurfaceProvider>,
    );
    const skeleton = screen.getByTestId('resource-card-skeleton');
    expect(skeleton).toHaveAttribute('data-size', 'default');
    expect(skeleton).toHaveClass('bg-card');
    expect(skeleton).not.toHaveClass('bg-embed');
    expect(skeleton.firstElementChild).toHaveClass('p-4');
    const buttons = screen.getByTestId('resource-card-skeleton-actions').lastElementChild?.children ?? [];
    expect(buttons).toHaveLength(5);
    for (const button of Array.from(buttons)) {
      expect(button).toHaveClass('bg-muted');
      expect(button).not.toHaveClass('bg-card');
    }
  });
});
