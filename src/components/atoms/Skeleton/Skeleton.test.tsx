import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders with default props', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');

    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute('data-slot', 'skeleton');
  });
});

describe('Skeleton - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-24 rounded-full" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
