import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { TimelinePostSkeleton } from './TimelinePostSkeleton';

vi.mock('@/organisms/PostCardSkeleton/PostCardSkeleton', () => ({
  PostCardSkeleton: () => <div data-testid="post-card-skeleton">PostCardSkeleton</div>,
}));

vi.mock('@/organisms/PostMain/PostMainListRow/PostMainListRow.skeleton', () => ({
  PostMainListRowSkeleton: () => <div data-testid="post-main-list-row-skeleton">PostMainListRowSkeleton</div>,
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const mockUseIsMobile = vi.mocked(useIsMobile);

describe('TimelinePostSkeleton', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
  });

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

  it('falls back to the post card skeleton on mobile even when the surface layout is list', () => {
    mockUseIsMobile.mockReturnValue(true);

    render(
      <PostMainLayoutProvider tagsLayout="list">
        <TimelinePostSkeleton />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('post-main-list-row-skeleton')).not.toBeInTheDocument();
  });
});
