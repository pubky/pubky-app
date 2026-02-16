import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserListItemSkeleton } from './UserListItemSkeleton';

describe('UserListItemSkeleton', () => {
  it('renders compact skeleton by default', () => {
    render(<UserListItemSkeleton />);
    expect(screen.getByTestId('user-list-item-skeleton-compact')).toBeInTheDocument();
  });

  it('renders full skeleton variant', () => {
    render(<UserListItemSkeleton variant="full" />);
    expect(screen.getByTestId('user-list-item-skeleton-full')).toBeInTheDocument();
  });
});

describe('UserListItemSkeleton - Snapshots', () => {
  it('matches snapshot for compact variant', () => {
    const { container } = render(<UserListItemSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for full variant', () => {
    const { container } = render(<UserListItemSkeleton variant="full" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
