import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
