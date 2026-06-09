import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { CompactUserListItemSkeleton } from './CompactUserListItemSkeleton';

describe('CompactUserListItemSkeleton', () => {
  it('renders compact skeleton', () => {
    render(<CompactUserListItemSkeleton />);
    expect(screen.getByTestId('user-list-item-skeleton-compact')).toBeInTheDocument();
  });
});

describe('CompactUserListItemSkeleton - Snapshots', () => {
  it('matches snapshot for compact variant', () => {
    const { container } = render(<CompactUserListItemSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('CompactUserListItemSkeleton - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<CompactUserListItemSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
