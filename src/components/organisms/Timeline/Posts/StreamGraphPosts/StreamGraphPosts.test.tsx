import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UseStreamGraphResult } from '@/hooks/useStreamGraph/useStreamGraph';
import { StreamGraphPosts } from './StreamGraphPosts';

const baseGraph: Partial<UseStreamGraphResult> = {};

vi.mock('@/hooks/useStreamGraph/useStreamGraph', () => ({
  useStreamGraph: () => ({
    nodes: [{ kind: 'user', id: 'user:a', pubky: 'a', name: 'Alice', image: null }],
    edges: [],
    relationships: new Map([['user:a', 'extended']]),
    classCounts: new Map([['extended', 1]]),
    focusId: null,
    selectedNode: null,
    expandedIds: new Set(),
    pathIds: null,
    timeBounds: { min: 1, max: 2 },
    timeCap: null,
    declutter: false,
    hiddenClasses: new Set(),
    isExpanding: false,
    isTracing: false,
    select: vi.fn(),
    expand: vi.fn(),
    refreshNode: vi.fn(),
    tracePath: vi.fn(),
    clearPath: vi.fn(),
    toggleClass: vi.fn(),
    toggleDeclutter: vi.fn(),
    setTimeCap: vi.fn(),
    ...baseGraph,
  }),
}));

vi.mock('@/organisms/SocialGraph/SocialGraph', () => ({
  SocialGraph: () => <div data-testid="canvas-stub" />,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => ({ currentUserPubky: null }),
}));

const props = {
  postIds: ['a:1'],
  loading: false,
  loadingMore: false,
  hasMore: true,
  loadMore: vi.fn(),
};

describe('StreamGraphPosts', () => {
  it('renders the canvas, legend, slim controls, and merge-more', () => {
    render(<StreamGraphPosts {...props} />);

    expect(screen.getByTestId('canvas-stub')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="stream-graph"]')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="graph-legend"]')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="stream-graph-declutter"]')).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-cy="stream-graph-load-more"]')!);
    expect(props.loadMore).toHaveBeenCalled();
  });

  it('hides merge-more when the stream is exhausted', () => {
    render(<StreamGraphPosts {...props} hasMore={false} />);
    expect(document.querySelector('[data-cy="stream-graph-load-more"]')).not.toBeInTheDocument();
  });
});
