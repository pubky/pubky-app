import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { TimelinePostSkeleton } from './TimelinePostSkeleton';

vi.mock('@/organisms/PostCardSkeleton/PostCardSkeleton', () => ({
  PostCardSkeleton: () => <div data-testid="post-card-skeleton">PostCardSkeleton</div>,
}));

vi.mock('@/organisms/PostMain/PostMainListRow.skeleton', () => ({
  PostMainListRowSkeleton: () => <div data-testid="post-main-list-row-skeleton">PostMainListRowSkeleton</div>,
}));

describe('TimelinePostSkeleton', () => {
  it('renders the list row skeleton when the surface layout is list', () => {
    render(
      <PostMainLayoutProvider tagsLayout="list">
        <TimelinePostSkeleton />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-main-list-row-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('post-card-skeleton')).not.toBeInTheDocument();
  });

  it('renders the default post card skeleton for non-list layouts', () => {
    render(
      <PostMainLayoutProvider tagsLayout="inline">
        <TimelinePostSkeleton />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('post-main-list-row-skeleton')).not.toBeInTheDocument();
  });
});
