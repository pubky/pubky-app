import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSelectedLayoutSegments } from 'next/navigation';
import HomeLayout from './layout';

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

vi.mock('next/navigation', () => ({
  useSelectedLayoutSegments: vi.fn(),
}));

vi.mock('@/atoms', () => ({
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
}));

describe('HomeLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('keeps feed content visible when post route is not active', () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue([]);

    render(
      <HomeLayout post={<div data-testid="parallel-post">Post</div>}>
        <div data-testid="feed-content">Feed</div>
      </HomeLayout>,
    );

    expect(screen.getByTestId('feed-content')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('contents');
  });

  it('hides feed content when intercepted post route is active', () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(['(..)post']);

    render(
      <HomeLayout post={<div data-testid="parallel-post">Post</div>}>
        <div data-testid="feed-content">Feed</div>
      </HomeLayout>,
    );

    expect(screen.getByTestId('feed-content')).toBeInTheDocument();
    expect(screen.getAllByTestId('container')[0]).toHaveClass('hidden');
  });

  it('forces scroll to top when flagged before entering /home', () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue([]);
    window.sessionStorage.setItem(FORCE_HOME_SCROLL_TOP_KEY, '1');

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    render(
      <HomeLayout post={<div data-testid="parallel-post">Post</div>}>
        <div data-testid="feed-content">Feed</div>
      </HomeLayout>,
    );

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(window.sessionStorage.getItem(FORCE_HOME_SCROLL_TOP_KEY)).toBeNull();
  });
});
