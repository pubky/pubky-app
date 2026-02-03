import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import * as Hooks from '@/hooks';

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
    useIsTouchDeviceSpy = vi.spyOn(Hooks, 'useIsTouchDevice').mockReturnValue(false);
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
