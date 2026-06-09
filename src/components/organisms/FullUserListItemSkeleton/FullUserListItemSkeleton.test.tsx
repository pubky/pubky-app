import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { FullUserListItemSkeleton } from './FullUserListItemSkeleton';

describe('FullUserListItemSkeleton', () => {
  it('renders full skeleton', () => {
    render(<FullUserListItemSkeleton />);
    expect(screen.getByTestId('user-list-item-skeleton-full')).toBeInTheDocument();
  });
});

describe('FullUserListItemSkeleton - Snapshots', () => {
  it('matches snapshot for full variant', () => {
    const { container } = render(<FullUserListItemSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('FullUserListItemSkeleton - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<FullUserListItemSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
