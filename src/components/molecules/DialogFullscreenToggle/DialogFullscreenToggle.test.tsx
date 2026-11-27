import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogFullscreenToggle } from './DialogFullscreenToggle';

vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

const requestFullscreen = vi.fn<() => Promise<void>>();
const exitFullscreen = vi.fn<() => Promise<void>>();

/** jsdom has no Fullscreen API: stub the parts `useFullscreen` reads and drive `fullscreenchange` by hand. */
function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
  document.dispatchEvent(new Event('fullscreenchange'));
}

describe('DialogFullscreenToggle', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    requestFullscreen.mockReset().mockResolvedValue(undefined);
    exitFullscreen.mockReset().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFullscreen;
    document.exitFullscreen = exitFullscreen;
  });

  it('requests document fullscreen on click', async () => {
    render(<DialogFullscreenToggle enabled />);

    const toggle = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(toggle).toHaveAttribute('data-cy', 'dialog-fullscreen-toggle');
    expect(toggle).not.toHaveAttribute('aria-pressed');

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('offers the exit while the document is fullscreen', async () => {
    render(<DialogFullscreenToggle enabled />);
    act(() => setFullscreenElement(document.documentElement));

    const toggle = screen.getByRole('button', { name: 'Exit fullscreen' });

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while disabled', () => {
    render(<DialogFullscreenToggle enabled={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing where the browser has no Fullscreen API', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });

    render(<DialogFullscreenToggle enabled />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
