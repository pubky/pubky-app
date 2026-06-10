import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
