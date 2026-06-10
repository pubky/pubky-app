import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
