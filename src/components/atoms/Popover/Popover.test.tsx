import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: vi.fn(() => false),
}));

describe('Popover', () => {
  it('renders with default props', () => {
    render(<Popover>Default Popover</Popover>);
    const popover = screen.getByText('Default Popover');
    expect(popover).toBeInTheDocument();
  });

  it('shows content when trigger is clicked', async () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button>Open Popover</button>
        </PopoverTrigger>
        <PopoverContent>
          <div>Popover Content</div>
        </PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // Content should appear after click
    expect(screen.getByText('Popover Content')).toBeInTheDocument();
  });
});

describe('Popover - Hover behavior', () => {
  let useIsTouchDeviceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    useIsTouchDeviceSpy = vi.mocked(useIsTouchDevice).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    useIsTouchDeviceSpy.mockRestore();
  });

  it('opens immediately on hover when hoverDelay is 0', async () => {
    render(
      <Popover hover hoverDelay={0}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');
    fireEvent.mouseEnter(trigger);

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('respects hoverDelay before opening', async () => {
    render(
      <Popover hover hoverDelay={500}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');
    fireEvent.mouseEnter(trigger);

    // Content should not be visible before delay
    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    // Advance time partially
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    // Advance time to complete delay
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('respects hoverCloseDelay before closing', async () => {
    render(
      <Popover hover hoverDelay={0} hoverCloseDelay={100}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');

    // Open popover
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Content')).toBeInTheDocument();

    // Start closing
    fireEvent.mouseLeave(trigger);

    // Should still be visible during close delay
    expect(screen.getByText('Content')).toBeInTheDocument();

    // Advance time to complete close delay
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Content should be closed now
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('cancels close when re-entering during hoverCloseDelay', async () => {
    render(
      <Popover hover hoverDelay={0} hoverCloseDelay={100}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');

    // Open popover
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Content')).toBeInTheDocument();

    // Start closing
    fireEvent.mouseLeave(trigger);

    // Re-enter before close delay completes
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.mouseEnter(trigger);

    // Complete the original close delay time
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Content should still be visible since we re-entered
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('cancels open when leaving during hoverDelay', async () => {
    render(
      <Popover hover hoverDelay={500}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');

    // Start opening
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    // Leave before delay completes
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.mouseLeave(trigger);

    // Complete the original delay time
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Content should not appear since we left
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('disables hover on touch devices', async () => {
    useIsTouchDeviceSpy.mockReturnValue(true);

    render(
      <Popover hover hoverDelay={0}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');
    fireEvent.mouseEnter(trigger);

    // Content should not appear on touch devices via hover
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('closes immediately when hoverCloseDelay is 0', async () => {
    render(
      <Popover hover hoverDelay={0} hoverCloseDelay={0}>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');

    // Open popover
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Content')).toBeInTheDocument();

    // Close popover
    fireEvent.mouseLeave(trigger);

    // Should close immediately
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
});

describe('Popover - Focus preservation', () => {
  let useIsTouchDeviceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    useIsTouchDeviceSpy = vi.mocked(useIsTouchDevice).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    useIsTouchDeviceSpy.mockRestore();
  });

  it('keeps focus on an outside element when the cursor crosses a hover trigger without opening', async () => {
    render(
      <>
        <input data-testid="outside-input" />
        <Popover hover hoverDelay={500} hoverCloseDelay={100}>
          <PopoverTrigger asChild>
            <button>Trigger</button>
          </PopoverTrigger>
          <PopoverContent>Content</PopoverContent>
        </Popover>
      </>,
    );

    const input = screen.getByTestId('outside-input');
    input.focus();

    const trigger = screen.getByTestId('popover-trigger');
    fireEvent.mouseEnter(trigger);

    // Leave before the open delay completes, then flush all pending timers
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(trigger);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('keeps focus on an outside element through a full hover open/close cycle', async () => {
    render(
      <>
        <input data-testid="outside-input" />
        <Popover hover hoverDelay={0} hoverCloseDelay={100}>
          <PopoverTrigger asChild>
            <button>Trigger</button>
          </PopoverTrigger>
          <PopoverContent>Content</PopoverContent>
        </Popover>
      </>,
    );

    const input = screen.getByTestId('outside-input');
    input.focus();

    const trigger = screen.getByTestId('popover-trigger');

    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(input).toHaveFocus();

    fireEvent.mouseLeave(trigger);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('returns focus to the trigger on close in click mode', async () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button>Trigger</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByTestId('popover-trigger');
    fireEvent.click(trigger);
    expect(screen.getByText('Content')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    // Radix defers close auto-focus in a setTimeout(0)
    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('Popover - Snapshots', () => {
  it('matches snapshot for PopoverTrigger with default props', () => {
    const { container } = render(
      <Popover>
        <PopoverTrigger>Open Popover</PopoverTrigger>
      </Popover>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PopoverTrigger with asChild', () => {
    const { container } = render(
      <Popover>
        <PopoverTrigger asChild>
          <button>Open Popover</button>
        </PopoverTrigger>
      </Popover>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for popover trigger in open state', () => {
    const { container } = render(
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <button>Open Popover</button>
        </PopoverTrigger>
        <PopoverContent>
          <div>Popover Content</div>
        </PopoverContent>
      </Popover>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
