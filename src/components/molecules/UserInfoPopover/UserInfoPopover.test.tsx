import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfoPopover } from './UserInfoPopover';

vi.mock('@/atoms', async () => {
  const React = await import('react');
  const OpenContext = React.createContext(false);

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
    PopoverContent: ({
      children,
      side,
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      side?: string;
    }) => {
      const open = React.useContext(OpenContext);

      if (!open && children == null) {
        return null;
      }

      return (
        <div data-testid="popover-content" data-side={side}>
          {children}
        </div>
      );
    },
  };
});

vi.mock('./components/UserInfoPopoverContent/UserInfoPopoverContent', () => ({
  UserInfoPopoverContent: () => <div data-testid="popover-inner-content">Content</div>,
}));

describe('UserInfoPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('keeps content mounted during close', () => {
    render(
      <UserInfoPopover userId="user123" userName="Test User" formattedPublicKey="user123">
        <button data-testid="trigger" type="button">
          Trigger
        </button>
      </UserInfoPopover>,
    );

    fireEvent.click(screen.getByTestId('open-popover'));
    fireEvent.click(screen.getByTestId('close-popover'));

    expect(screen.getByTestId('popover-inner-content')).toBeInTheDocument();
  });

  it('keeps content mounted during close without forcing a side', () => {
    render(
      <UserInfoPopover userId="user123" userName="Test User" formattedPublicKey="user123">
        <button data-testid="trigger" type="button">
          Trigger
        </button>
      </UserInfoPopover>,
    );

    fireEvent.click(screen.getByTestId('open-popover'));
    fireEvent.click(screen.getByTestId('close-popover'));

    expect(screen.getByTestId('popover-content')).not.toHaveAttribute('data-side');
    expect(screen.getByTestId('popover-inner-content')).toBeInTheDocument();
  });
});
