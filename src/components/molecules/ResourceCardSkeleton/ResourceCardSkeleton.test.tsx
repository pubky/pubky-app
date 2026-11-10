import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceCardSkeleton } from './ResourceCardSkeleton';

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
});
