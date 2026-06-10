import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostCardSkeleton } from './PostCardSkeleton';

describe('PostCardSkeleton', () => {
  it('renders header, content, and actions skeletons', () => {
    const { container } = render(<PostCardSkeleton />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('PostCardSkeleton - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<PostCardSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
