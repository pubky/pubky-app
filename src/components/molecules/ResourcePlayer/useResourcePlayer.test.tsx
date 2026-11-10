import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFramePress } from './useResourcePlayer';

describe('useFramePress', () => {
  function Pressable({ testId, onPress, enabled = true }: { testId: string; onPress: () => void; enabled?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useFramePress(ref, onPress, enabled);
    return (
      <div ref={ref}>
        <iframe title={testId} data-testid={testId} />
      </div>
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sees, with one look now and then, the focus move on from one frame into another', () => {
    vi.useFakeTimers();
    const intervals = vi.spyOn(window, 'setInterval');
    const [first, second] = [vi.fn(), vi.fn()];
    render(
      <>
        <Pressable testId="first" onPress={first} />
        <Pressable testId="second" onPress={second} />
      </>,
    );
    act(() => {
      fireEvent.mouseOver(screen.getByTestId('first'));
      screen.getByTestId('first').focus();
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1);
    });
    expect(first).toHaveBeenCalled();
    expect(intervals).toHaveBeenCalledTimes(1);

    // Firefox and Safari: no event on the page while the focus moves on.
    fireEvent.mouseOver(screen.getByTestId('second'));
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(screen.getByTestId('second'));
    act(() => vi.advanceTimersByTime(300));
    expect(second).toHaveBeenCalled();
    expect(intervals).toHaveBeenCalledTimes(1);
  });

  it('sees a press in a frame that was already focused when it was turned on', () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    const { rerender } = render(<Pressable testId="frame" onPress={onPress} enabled={false} />);
    act(() => screen.getByTestId('frame').focus());

    rerender(<Pressable testId="frame" onPress={onPress} />);
    fireEvent.mouseOver(screen.getByTestId('frame'));
    act(() => vi.advanceTimersByTime(300));
    expect(onPress).toHaveBeenCalled();
  });

  it('takes the focus moved into a frame without the pointer over it (tabbing) for no press', () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    render(<Pressable testId="frame" onPress={onPress} />);
    fireEvent.mouseOver(document.body);

    act(() => {
      screen.getByTestId('frame').focus();
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(300);
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('takes the focus moved into a frame without the pointer over it for a press on a device without hover', () => {
    vi.useFakeTimers();
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(hover: none)' }));
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
    try {
      const onPress = vi.fn();
      render(<Pressable testId="frame" onPress={onPress} />);

      act(() => {
        screen.getByTestId('frame').focus();
        window.dispatchEvent(new Event('blur'));
        vi.advanceTimersByTime(300);
      });
      expect(onPress).toHaveBeenCalled();
      expect(matchMedia).toHaveBeenCalledWith('(hover: none)');
    } finally {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });
});
