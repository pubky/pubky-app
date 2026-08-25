import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '@/atoms/Dialog/Dialog';
import type { Pubky } from '@/models/models.types';
import { MentionPopover } from './MentionPopover';

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      onMouseEnter,
      ...props
    }: React.PropsWithChildren<{ className?: string; onMouseEnter?: () => void }>) => (
      <div className={className} onMouseEnter={onMouseEnter} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: ({ size }: { size: string }) => <div data-testid="spinner" data-size={size} />,
  };
});

vi.mock('@/molecules/SearchUserSuggestion/SearchUserSuggestion', () => {
  return {
    SearchUserSuggestion: ({
      user,
      onClick,
    }: {
      user: { id: string; name: string };
      onClick?: (id: string) => void;
    }) => (
      <div data-testid={`user-suggestion-${user.id}`} onClick={() => onClick?.(user.id)}>
        {user.name}
      </div>
    ),
  };
});

describe('MentionPopover', () => {
  const mockUsers = [
    { id: 'user1' as Pubky, name: 'John Doe', avatarUrl: 'https://example.com/avatar1.jpg' },
    { id: 'user2' as Pubky, name: 'Jane Smith', avatarUrl: 'https://example.com/avatar2.jpg' },
    { id: 'user3' as Pubky, name: 'Bob Wilson' },
  ];

  const anchorRef = { current: document.createElement('textarea') };

  const defaultProps = {
    anchorRef,
    users: mockUsers,
    selectedIndex: null,
    onSelect: vi.fn(),
    onHover: vi.fn(),
  };

  it('renders nothing when users array is empty', () => {
    const { container } = render(<MentionPopover {...defaultProps} users={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders all users', () => {
    render(<MentionPopover {...defaultProps} />);

    expect(screen.getByTestId('user-suggestion-user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-suggestion-user2')).toBeInTheDocument();
    expect(screen.getByTestId('user-suggestion-user3')).toBeInTheDocument();
  });

  it('calls onSelect when a user is clicked', () => {
    const onSelect = vi.fn();
    render(<MentionPopover {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('user-suggestion-user1'));

    expect(onSelect).toHaveBeenCalledWith('user1');
  });

  it('calls onHover when hovering over a user', () => {
    const onHover = vi.fn();
    render(<MentionPopover {...defaultProps} onHover={onHover} />);

    fireEvent.mouseEnter(screen.getByTestId('mention-popover-item-0'));

    expect(onHover).toHaveBeenCalledWith(0);
  });

  it('applies selected style to selected index', () => {
    render(<MentionPopover {...defaultProps} selectedIndex={1} />);

    const selectedItem = screen.getByTestId('mention-popover-item-1');
    expect(selectedItem.className).toContain('bg-accent');
  });

  it('has correct testid on container', () => {
    render(<MentionPopover {...defaultProps} />);

    expect(screen.getByTestId('mention-popover')).toBeInTheDocument();
  });

  it('repositions when the anchor resizes', () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const originalResizeObserver = globalThis.ResizeObserver;
    const observeAnchor = vi.fn();
    const callbackObserver: ResizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
    const anchor = document.createElement('textarea');
    const getBoundingClientRect = vi
      .spyOn(anchor, 'getBoundingClientRect')
      .mockReturnValueOnce(new DOMRect(20, 80, 320, 20))
      .mockReturnValue(new DOMRect(24, 80, 320, 44));

    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = observeAnchor;
      unobserve(): void {}
      disconnect(): void {}
    }

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: TestResizeObserver,
    });

    try {
      render(<MentionPopover {...defaultProps} anchorRef={{ current: anchor }} />);
      const popover = screen.getByTestId('mention-popover');

      expect(observeAnchor).toHaveBeenCalledWith(anchor);
      expect(popover).toHaveStyle({ top: '100px', left: '20px' });

      act(() => resizeCallback?.([], callbackObserver));

      expect(popover).toHaveStyle({ top: '124px', left: '24px' });
    } finally {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: originalResizeObserver,
      });
      getBoundingClientRect.mockRestore();
    }
  });

  describe('MentionPopover - portal target', () => {
    function DialogComposer({ onSelect = vi.fn() }: { onSelect?: (userId: string) => void }) {
      const anchorRef = useRef<HTMLTextAreaElement>(null);

      return (
        <Dialog open>
          <DialogContent hiddenTitle="Reply to post">
            <textarea ref={anchorRef} />
            <MentionPopover {...defaultProps} onSelect={onSelect} anchorRef={anchorRef} />
          </DialogContent>
        </Dialog>
      );
    }

    it('mounts on the body when the anchor is not inside a dialog', () => {
      const anchor = document.createElement('textarea');
      document.body.appendChild(anchor);

      try {
        render(<MentionPopover {...defaultProps} anchorRef={{ current: anchor }} />);

        expect(screen.getByTestId('mention-popover').parentElement).toBe(document.body);
      } finally {
        anchor.remove();
      }
    });

    it('mounts inside the dialog content when the anchor is inside a dialog', () => {
      render(<DialogComposer />);

      // The dialog disables pointer events on the body, so a popover portalled
      // there would be inert and taps would land on the dialog behind it.
      expect(document.body.style.pointerEvents).toBe('none');
      expect(screen.getByTestId('dialog-content')).toContainElement(screen.getByTestId('mention-popover'));
    });

    it('lets a suggestion be clicked while a dialog is open', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(<DialogComposer onSelect={onSelect} />);

      await user.click(screen.getByTestId('user-suggestion-user1'));

      expect(onSelect).toHaveBeenCalledWith('user1');
    });
  });

  describe('MentionPopover - Snapshots', () => {
    // The popover renders in a portal, so it lives in document.body, not the render container.
    it('matches snapshot with users', () => {
      render(<MentionPopover {...defaultProps} />);
      expect(screen.getByTestId('mention-popover')).toMatchSnapshot();
    });

    it('matches snapshot with selected index', () => {
      render(<MentionPopover {...defaultProps} selectedIndex={0} />);
      expect(screen.getByTestId('mention-popover')).toMatchSnapshot();
    });

    it('matches snapshot with empty users', () => {
      const { container } = render(<MentionPopover {...defaultProps} users={[]} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
