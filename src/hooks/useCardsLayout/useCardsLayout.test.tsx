import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCardsLayout } from './useCardsLayout';

const observers: Array<{
  notify: () => void;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}> = [];
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;

function Harness({
  heights = [100, 200, 80],
  ids = heights.map((_, index) => String(index)),
  columns = 2,
  trailing = false,
  pending = [],
}: {
  heights?: number[];
  ids?: string[];
  columns?: number;
  trailing?: boolean;
  pending?: string[];
}) {
  const ref = useCardsLayout(ids, trailing);
  return (
    <div
      data-testid="cards"
      ref={ref}
      style={{ display: 'grid', gridTemplateColumns: Array(columns).fill('294px').join(' '), columnGap: 12 }}
    >
      {heights.map((height, index) => (
        <div key={ids[index]} data-height={height} data-testid={`card-${ids[index]}`}>
          {pending.includes(ids[index]) ? <span data-post-content-pending>Loading</span> : <>Post {ids[index]}</>}
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
      constructor(callback: (entries: Array<{ target: Element }>) => void) {
        const notify = () => callback([{ target: screen.getByTestId('cards').firstElementChild! }]);
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

describe('useCardsLayout', () => {
  it('uses one active observer and remeasures expanded cards once per frame without overlap', () => {
    const { rerender, unmount } = render(<Harness />);
    expect(observers).toHaveLength(1);
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
    expect(screen.getByTestId('cards')).toHaveStyle({ height: '392px' });
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
    expect(screen.getByTestId('cards')).toHaveStyle({ height: '304px' });
    expect(Array.from(screen.getByTestId('cards').children).map((node) => node.textContent)).toEqual([
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
    expect(screen.getByTestId('cards').style.height).toBe('');
    expect(screen.getByTestId('card-2').style.position).toBe('');
    expect(screen.getByTestId('card-2').style.width).toBe('');
    rerender(<Harness columns={3} />);
    flushMeasurements();
    expect(screen.getByTestId('card-2')).toHaveStyle({ top: '0px', left: '408px' });
  });

  it('closes gaps after removal and measures only the remaining cards', () => {
    const { rerender } = render(<Harness />);
    const previousObserver = observers.at(-1)!;
    rerender(<Harness ids={['1', '2']} heights={[200, 80]} />);
    expect(screen.queryByTestId('card-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-1')).toHaveStyle({ top: '0px', left: '306px' });
    expect(screen.getByTestId('card-2')).toHaveStyle({ top: '0px', left: '0px' });
    expect(screen.getByTestId('cards')).toHaveStyle({ height: '200px' });
    expect(previousObserver.disconnect).toHaveBeenCalledOnce();
    expect(observers.at(-1)?.observe).toHaveBeenCalledTimes(3);
  });
  it('packs resolved content rather than pinning equal loading placeholders', () => {
    const ids = ['0', '1', '2', '3', '4', '5'];
    const { rerender } = render(<Harness ids={ids} heights={ids.map(() => 100)} pending={ids} columns={3} />);
    rerender(<Harness ids={ids} heights={[650, 280, 280, 650, 280, 280]} columns={3} />);
    flushMeasurements();
    expect(screen.getByTestId('card-3')).toHaveStyle({ left: '204px', top: '292px' });
    expect(screen.getByTestId('cards')).toHaveStyle({ height: '942px' });
    rerender(<Harness ids={ids} heights={[50, 280, 280, 650, 280, 280]} columns={3} />);
    flushMeasurements();
    expect(screen.getByTestId('card-3')).toHaveStyle({ left: '204px', top: '292px' });
  });

  it('preserves expanded existing columns while an appended page resolves', () => {
    const { rerender } = render(<Harness />);
    rerender(<Harness heights={[300, 200, 80]} />);
    flushMeasurements();
    rerender(<Harness heights={[300, 200, 80, 100, 100]} pending={['3', '4']} />);
    rerender(<Harness heights={[300, 200, 80, 400, 50]} />);
    flushMeasurements();
    expect(screen.getByTestId('card-2')).toHaveStyle({ left: '0px', top: '312px' });
    expect(screen.getByTestId('card-3')).toHaveStyle({ left: '306px', top: '212px' });
    expect(screen.getByTestId('card-4')).toHaveStyle({ left: '0px', top: '404px' });
  });

  it('detects resolved placeholders even when their heights do not change', async () => {
    const { rerender } = render(<Harness pending={['0', '1', '2']} />);
    rerender(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(frames.size).toBe(1);
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    rerender(<Harness heights={[300, 200, 80]} />);
    flushMeasurements();
    expect(screen.getByTestId('card-2')).toHaveStyle({ left: '0px', top: '312px' });
  });

  it('uses normal flow without reading card heights on mobile', () => {
    render(<Harness columns={1} />);
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled();
    flushMeasurements();
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled();
  });
});
