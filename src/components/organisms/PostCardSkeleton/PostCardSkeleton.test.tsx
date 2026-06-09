import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
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

describe('PostCardSkeleton - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<PostCardSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
