import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from './Progress';

describe('Progress', () => {
  it('renders a progressbar with the clamped value', () => {
    render(<Progress value={42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('data-state', 'loading');
    expect(bar.firstElementChild).toHaveStyle({ transform: 'translateX(-58%)' });
  });

  it('clamps a value outside 0..100', () => {
    const { rerender } = render(<Progress value={250} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<Progress value={-5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('is indeterminate without a value', () => {
    render(<Progress value={null} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-state', 'indeterminate');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar.firstElementChild).toHaveClass('animate-pulse');
  });

  it('merges a className', () => {
    render(<Progress value={10} className="h-4" />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-4');
  });
});
