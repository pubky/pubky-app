import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStablePopoverPlacement } from './useStablePopoverPlacement';
import { STABLE_POPOVER_ESTIMATED_HEIGHT } from './useStablePopoverPlacement.constants';

function createRect(top: number, bottom: number) {
  return {
    width: 200,
    height: bottom - top,
    top,
    bottom,
    left: 0,
    right: 200,
    x: 0,
    y: top,
    toJSON: () => undefined,
  };
}

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = [];

  callback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  trigger(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        } as ResizeObserverEntry,
      ],
      this,
    );
  }
}

describe('useStablePopoverPlacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestResizeObserver.instances = [];
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: TestResizeObserver,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 900,
    });
  });

  it('defaults to the preferred side', () => {
    const triggerRef = {
      current: {
        getBoundingClientRect: () => createRect(420, 460),
      },
    } as React.RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useStablePopoverPlacement({
        enabled: true,
        open: false,
        preferredSide: 'bottom',
        triggerRef,
        sideOffset: 1,
        viewportPadding: { top: 150, bottom: 16 },
      }),
    );

    expect(result.current.side).toBe('bottom');
  });

  it('resolve chooses bottom when top space is insufficient', () => {
    const triggerRef = {
      current: {
        getBoundingClientRect: () => createRect(180, 220),
      },
    } as React.RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useStablePopoverPlacement({
        enabled: true,
        open: false,
        preferredSide: 'top',
        triggerRef,
        sideOffset: 1,
        viewportPadding: { top: 150, bottom: 16 },
      }),
    );

    act(() => {
      result.current.resolve();
    });

    expect(result.current.side).toBe('bottom');
  });

  it('resolve falls back to the preferred side when the trigger ref is unavailable', () => {
    const { result } = renderHook(() =>
      useStablePopoverPlacement({
        enabled: true,
        open: false,
        preferredSide: 'bottom',
        triggerRef: { current: null },
      }),
    );

    act(() => {
      result.current.resolve();
    });

    expect(result.current.side).toBe('bottom');
  });

  it('reuses the measured height across later resolve calls', () => {
    const triggerRef = {
      current: {
        getBoundingClientRect: () => createRect(180, 220),
      },
    } as React.RefObject<HTMLElement | null>;

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useStablePopoverPlacement({
          enabled: true,
          open,
          preferredSide: 'top',
          triggerRef,
          sideOffset: 1,
          viewportPadding: { top: 150, bottom: 16 },
        }),
      { initialProps: { open: false } },
    );

    const contentElement = document.createElement('div');
    Object.defineProperty(contentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 280,
        height: 300,
        top: 0,
        bottom: 300,
        left: 0,
        right: 280,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    act(() => {
      result.current.contentRef.current = contentElement;
    });

    rerender({ open: true });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 696,
    });
    Object.defineProperty(triggerRef.current as object, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(380, 420),
    });

    act(() => {
      result.current.resolve();
    });

    expect(result.current.side).toBe('bottom');
  });

  it('updates cached height only when enabled and open', () => {
    const triggerRef = {
      current: {
        getBoundingClientRect: () => createRect(180, 220),
      },
    } as React.RefObject<HTMLElement | null>;

    const { result, rerender } = renderHook(
      ({ enabled, open }: { enabled: boolean; open: boolean }) =>
        useStablePopoverPlacement({
          enabled,
          open,
          preferredSide: 'top',
          triggerRef,
          sideOffset: 1,
          viewportPadding: { top: 150, bottom: 16 },
        }),
      { initialProps: { enabled: false, open: false } },
    );

    const contentElement = document.createElement('div');
    let height = STABLE_POPOVER_ESTIMATED_HEIGHT;
    Object.defineProperty(contentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 280,
        height,
        top: 0,
        bottom: height,
        left: 0,
        right: 280,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    act(() => {
      result.current.contentRef.current = contentElement;
    });

    rerender({ enabled: false, open: true });
    expect(TestResizeObserver.instances).toHaveLength(0);

    rerender({ enabled: true, open: true });
    expect(TestResizeObserver.instances).toHaveLength(1);
    expect(TestResizeObserver.instances[0].observe).toHaveBeenCalledWith(contentElement);

    height = 300;
    act(() => {
      TestResizeObserver.instances[0].trigger(contentElement);
    });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 696,
    });
    Object.defineProperty(triggerRef.current as object, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(380, 420),
    });

    act(() => {
      result.current.resolve();
    });

    expect(result.current.side).toBe('bottom');
  });
});
