import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFullscreenToggle } from './useFullscreenToggle';

describe('useFullscreenToggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });

  it('starts windowed and toggles', () => {
    const { result } = renderHook(() => useFullscreenToggle());
    expect(result.current.isFullscreen).toBe(false);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);
  });

  it('locks body scroll while fullscreen and restores it after', () => {
    document.body.style.overflow = 'auto';
    const { result } = renderHook(() => useFullscreenToggle());

    act(() => result.current.toggleFullscreen());
    expect(document.body.style.overflow).toBe('hidden');

    act(() => result.current.toggleFullscreen());
    expect(document.body.style.overflow).toBe('auto');
  });

  it('exits on Escape unless another layer already handled the key', () => {
    const { result } = renderHook(() => useFullscreenToggle());
    act(() => result.current.toggleFullscreen());

    // A Radix popover/dialog consumes Escape in the capture phase
    document.addEventListener('keydown', (event) => event.preventDefault(), { capture: true, once: true });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    });
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('ignores Escape while windowed and drops the listener on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { result, unmount } = renderHook(() => useFullscreenToggle());
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);

    act(() => result.current.toggleFullscreen());
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);

    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
  });

  it('reports each toggle two frames later, once the resized canvas has re-rendered', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const flushFrame = () => {
      const pending = frames.splice(0);
      pending.forEach((cb) => cb(performance.now()));
    };
    const onToggled = vi.fn();
    const { result } = renderHook(() => useFullscreenToggle(onToggled));
    flushFrame();
    flushFrame();
    // Mount is not a toggle
    expect(onToggled).not.toHaveBeenCalled();

    act(() => result.current.toggleFullscreen());
    expect(onToggled).not.toHaveBeenCalled();
    flushFrame();
    expect(onToggled).not.toHaveBeenCalled();
    flushFrame();
    expect(onToggled).toHaveBeenCalledTimes(1);

    act(() => result.current.toggleFullscreen());
    flushFrame();
    flushFrame();
    expect(onToggled).toHaveBeenCalledTimes(2);
  });
});
