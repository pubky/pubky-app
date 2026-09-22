import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMasonryLayout } from './useMasonryLayout';

const observers: Array<{
  notify: () => void;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}> = [];
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;

function Harness({
  heights = [100, 200, 80],
  columns = 2,
  trailing = false,
}: {
  heights?: number[];
  columns?: number;
  trailing?: boolean;
}) {
  const ref = useMasonryLayout(
    heights.map((_, index) => String(index)),
    trailing,
  );
  return (
    <div
      data-testid="masonry"
      ref={ref}
      style={{ display: 'grid', gridTemplateColumns: Array(columns).fill('294px').join(' '), columnGap: 12 }}
    >
      {heights.map((height, index) => (
        <div key={index} data-height={height} data-testid={`card-${index}`}>
          Post {index}
        </div>
      ))}
      {trailing && (
        <div data-height="48" data-testid="trailing">
          Add Post
        </div>
      )}
    </div>
  );
}

beforeEach(() => {
  observers.length = 0;
  frames.clear();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, 294, Number(this.dataset.height ?? 0));
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(notify: () => void) {
        observers.push({ notify, observe: this.observe, disconnect: this.disconnect });
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function flushMeasurements() {
  act(() => {
    observers.at(-1)?.notify();
    for (const [id, callback] of frames) {
      frames.delete(id);
      callback(0);
    }
  });
}

describe('useMasonryLayout', () => {
  it('uses one active observer and remeasures expanded cards once per frame without overlap', () => {
    const { rerender, unmount } = render(<Harness />);
    expect(observers.filter((observer) => observer.disconnect.mock.calls.length === 0)).toHaveLength(1);
    expect(screen.getByTestId('card-2')).toHaveStyle({ top: '112px', left: '0px' });
    rerender(<Harness heights={[300, 200, 80]} />);
    act(() => {
      observers.at(-1)?.notify();
      observers.at(-1)?.notify();
    });
    expect(frames.size).toBe(1);
    flushMeasurements();
    expect(screen.getByTestId('card-2')).toHaveStyle({ top: '312px', left: '0px' });
    expect(screen.getByTestId('masonry')).toHaveStyle({ height: '392px' });
    act(() => observers.at(-1)?.notify());
    unmount();
    expect(frames.size).toBe(0);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it('keeps source order and existing positions on append, with the Add Post tile below its column', () => {
    const { rerender } = render(<Harness trailing />);
    rerender(<Harness heights={[100, 200, 80, 100]} trailing />);
    expect(screen.getByTestId('card-2')).toHaveStyle({ top: '112px', left: '0px' });
    expect(screen.getByTestId('card-3')).toHaveStyle({ top: '204px', left: '0px' });
    expect(screen.getByTestId('trailing')).toHaveStyle({ top: '212px', left: '306px' });
    expect(screen.getByTestId('masonry')).toHaveStyle({ height: '304px' });
    expect(Array.from(screen.getByTestId('masonry').children).map((node) => node.textContent)).toEqual([
      'Post 0',
      'Post 1',
      'Post 2',
      'Post 3',
      'Add Post',
    ]);
  });

  it('returns to normal document flow on mobile and repacks on desktop resize', () => {
    const { rerender } = render(<Harness />);
    rerender(<Harness columns={1} />);
    flushMeasurements();
    expect(screen.getByTestId('masonry').style.height).toBe('');
    expect(screen.getByTestId('card-2').style.position).toBe('');
    expect(screen.getByTestId('card-2').style.width).toBe('');
    rerender(<Harness columns={3} />);
    flushMeasurements();
    expect(screen.getByTestId('card-2')).toHaveStyle({ top: '0px', left: '408px' });
  });
});
