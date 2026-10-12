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
