import { useSelectedLayoutSegments } from 'next/navigation';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FeedLayout from './layout';

vi.mock('next/navigation', () => ({
  useSelectedLayoutSegments: vi.fn(),
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" data-override-defaults={overrideDefaults ? 'true' : 'false'} className={className}>
        {children}
      </div>
    ),
  };
});

describe('FeedLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps feed content visible when post route is not active', () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue([]);

    render(
      <FeedLayout post={<div data-testid="parallel-post">Post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedLayout>,
    );

    expect(screen.getByTestId('feed-content')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('contents');
  });

  it('hides feed content when intercepted post route is active', () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(['(...)post']);

    render(
      <FeedLayout post={<div data-testid="parallel-post">Post</div>}>
        <div data-testid="feed-content">Feed</div>
      </FeedLayout>,
    );

    expect(screen.getByTestId('feed-content')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('hidden');
  });
});
