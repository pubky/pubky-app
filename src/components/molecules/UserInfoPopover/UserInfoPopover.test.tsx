import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef } from 'react';
import { UserInfoPopover } from './UserInfoPopover';
import { STABLE_POPOVER_ESTIMATED_HEIGHT } from './UserInfoPopover.constants';

const { measurementState } = vi.hoisted(() => ({
  measurementState: {
    contentHeight: 220,
  },
}));

vi.mock('@/atoms', async () => {
  const React = await import('react');
  const OpenContext = React.createContext(false);
  type MockPopoverContentProps = React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode;
    side?: string;
    avoidCollisions?: boolean;
  };

  return {
    Popover: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <OpenContext.Provider value={Boolean(open)}>
        <div data-testid="popover" data-open={String(Boolean(open))}>
          <button data-testid="open-popover" type="button" onClick={() => onOpenChange?.(true)}>
            Open
          </button>
          <button data-testid="close-popover" type="button" onClick={() => onOpenChange?.(false)}>
            Close
          </button>
          {children}
        </div>
      </OpenContext.Provider>
    ),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="popover-trigger">{children}</div>
    ),
    PopoverContent: React.forwardRef<HTMLDivElement, MockPopoverContentProps>(function MockPopoverContent(
      { children, side, avoidCollisions },
      ref,
    ) {
      const open = React.useContext(OpenContext);
      const innerRef = React.useRef<HTMLDivElement>(null);
      const handleRef = (node: HTMLDivElement | null) => {
        innerRef.current = node;

        if (typeof ref === 'function') {
          ref(node);
          return;
        }

        if (ref) {
          ref.current = node;
        }
      };

      React.useLayoutEffect(() => {
        if (!innerRef.current) return;

        Object.defineProperty(innerRef.current, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({
            width: 280,
            height: measurementState.contentHeight,
            top: 0,
            bottom: measurementState.contentHeight,
            left: 0,
            right: 280,
            x: 0,
            y: 0,
            toJSON: () => undefined,
          }),
        });
      });

      if (!open && children == null) {
        return null;
      }

      return (
        <div
          ref={handleRef}
          data-testid="popover-content"
          data-side={side}
          {...(avoidCollisions !== undefined ? { 'data-avoid-collisions': String(avoidCollisions) } : {})}
        >
          {children}
        </div>
      );
    }),
  };
});

vi.mock('./components/UserInfoPopoverContent/UserInfoPopoverContent', () => ({
  UserInfoPopoverContent: () => <div data-testid="popover-inner-content">Content</div>,
}));

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

function StablePopoverHarness({
  preferredSide = 'top',
  includeTriggerRef = true,
}: {
  preferredSide?: 'top' | 'bottom';
  includeTriggerRef?: boolean;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);

  return (
    <UserInfoPopover
      userId="user123"
      userName="Test User"
      formattedPublicKey="user123"
      preferredSide={preferredSide}
      stablePlacement={{
        triggerRef,
        viewportPadding: { top: 150, bottom: 16 },
      }}
    >
      <div ref={includeTriggerRef ? triggerRef : undefined} data-testid="trigger-host">
        <button data-testid="trigger" type="button">
          Trigger
        </button>
      </div>
    </UserInfoPopover>
  );
}

describe('UserInfoPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    measurementState.contentHeight = STABLE_POPOVER_ESTIMATED_HEIGHT;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 900,
    });
  });

  it('does not mount popover content until it is opened', () => {
    render(
      <UserInfoPopover userId="user123" userName="Test User" formattedPublicKey="user123">
        <button data-testid="trigger" type="button">
          Trigger
        </button>
      </UserInfoPopover>,
    );

    expect(screen.queryByTestId('popover-inner-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-popover'));

    expect(screen.getByTestId('popover-inner-content')).toBeInTheDocument();
  });

  it('resolves a stable side before opening and disables collisions', () => {
    render(<StablePopoverHarness />);

    const triggerHost = screen.getByTestId('trigger-host');
    Object.defineProperty(triggerHost, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(180, 220),
    });

    fireEvent.click(screen.getByTestId('open-popover'));

    const content = screen.getByTestId('popover-content');
    expect(content).toHaveAttribute('data-side', 'bottom');
    expect(content).toHaveAttribute('data-avoid-collisions', 'false');
  });

  it('keeps the chosen side fixed while the popover stays open', () => {
    const { rerender } = render(<StablePopoverHarness />);

    const triggerHost = screen.getByTestId('trigger-host');
    Object.defineProperty(triggerHost, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(180, 220),
    });

    fireEvent.click(screen.getByTestId('open-popover'));
    expect(screen.getByTestId('popover-content')).toHaveAttribute('data-side', 'bottom');

    Object.defineProperty(triggerHost, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(520, 560),
    });

    rerender(<StablePopoverHarness />);

    expect(screen.getByTestId('popover-content')).toHaveAttribute('data-side', 'bottom');
  });

  it('reuses the measured height from a previous opening', () => {
    render(<StablePopoverHarness />);

    const triggerHost = screen.getByTestId('trigger-host');
    Object.defineProperty(triggerHost, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(180, 220),
    });

    measurementState.contentHeight = 300;
    fireEvent.click(screen.getByTestId('open-popover'));
    fireEvent.click(screen.getByTestId('close-popover'));

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 696,
    });
    Object.defineProperty(triggerHost, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(380, 420),
    });
    measurementState.contentHeight = 100;

    fireEvent.click(screen.getByTestId('open-popover'));

    expect(screen.getByTestId('popover-content')).toHaveAttribute('data-side', 'bottom');
  });

  it('keeps content mounted and keeps the resolved side during close', () => {
    render(<StablePopoverHarness />);

    const triggerHost = screen.getByTestId('trigger-host');
    Object.defineProperty(triggerHost, 'getBoundingClientRect', {
      configurable: true,
      value: () => createRect(180, 220),
    });

    fireEvent.click(screen.getByTestId('open-popover'));
    fireEvent.click(screen.getByTestId('close-popover'));

    const content = screen.getByTestId('popover-content');
    expect(content).toHaveAttribute('data-side', 'bottom');
    expect(screen.getByTestId('popover-inner-content')).toBeInTheDocument();
  });

  it('falls back to the preferred side when stable mode has no trigger ref', () => {
    render(<StablePopoverHarness preferredSide="bottom" includeTriggerRef={false} />);

    fireEvent.click(screen.getByTestId('open-popover'));

    const content = screen.getByTestId('popover-content');
    expect(content).toHaveAttribute('data-side', 'bottom');
    expect(content).toHaveAttribute('data-avoid-collisions', 'false');
  });
});
