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

  it('shows a first value at once instead of sliding down from the indeterminate fill', () => {
    const { rerender } = render(<Progress value={null} />);
    const indeterminate = screen.getByRole('progressbar').firstElementChild;
    rerender(<Progress value={8} />);
    const determinate = screen.getByRole('progressbar').firstElementChild;
    expect(determinate).not.toBe(indeterminate);
    expect(determinate).toHaveStyle({ transform: 'translateX(-92%)' });
    rerender(<Progress value={15} />);
    expect(screen.getByRole('progressbar').firstElementChild).toBe(determinate);
  });

  it('merges a className', () => {
    render(<Progress value={10} className="h-4" />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-4');
  });
});
