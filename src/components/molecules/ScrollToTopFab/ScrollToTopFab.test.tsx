import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ScrollToTopFab } from './ScrollToTopFab';

vi.mock('@/hooks', () => ({
  useIsScrolledFromTop: vi.fn(),
}));

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

describe('ScrollToTopFab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  it('renders nothing when not scrolled', async () => {
    const Hooks = await import('@/hooks');
    vi.mocked(Hooks.useIsScrolledFromTop).mockReturnValue(false);

    const { container } = render(<ScrollToTopFab />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when scrolled', async () => {
    const Hooks = await import('@/hooks');
    vi.mocked(Hooks.useIsScrolledFromTop).mockReturnValue(true);

    render(<ScrollToTopFab />);
    expect(screen.getByTestId('scroll-to-top-fab')).toBeInTheDocument();
  });

  it('scrolls to top when clicked', async () => {
    const Hooks = await import('@/hooks');
    vi.mocked(Hooks.useIsScrolledFromTop).mockReturnValue(true);

    render(<ScrollToTopFab />);
    fireEvent.click(screen.getByTestId('scroll-to-top-fab'));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('renders arrow up icon', async () => {
    const Hooks = await import('@/hooks');
    vi.mocked(Hooks.useIsScrolledFromTop).mockReturnValue(true);

    render(<ScrollToTopFab />);
    expect(document.querySelector('.lucide-arrow-up')).toBeInTheDocument();
  });
});
