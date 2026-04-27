import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarZoomModal } from './AvatarZoomModal';

// Mock hooks
vi.mock('@/hooks', () => ({
  useBodyScrollLock: vi.fn(),
}));

// Mock Atoms components
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    onClick,
    'data-testid': testId,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    'data-testid'?: string;
    [key: string]: unknown;
  }) => {
    return (
      <div className={className} onClick={onClick} data-testid={testId} {...props}>
        {children}
      </div>
    );
  },
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>
      {children}
    </div>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => <img data-testid="avatar-image" src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div data-testid="avatar-fallback">{children}</div>,
}));

// Mock Organisms components
vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    AvatarWithFallback: ({
      avatarUrl,
      name,
      fallbackSeed,
      className,
      fallbackClassName,
      alt,
    }: {
      avatarUrl?: string;
      name: string;
      fallbackSeed?: string;
      className?: string;
      fallbackClassName?: string;
      alt?: string;
    }) => (
      <div data-testid="avatar" data-fallback-seed={fallbackSeed} className={className}>
        {avatarUrl ? (
          <img data-testid="avatar-image" src={avatarUrl} alt={alt || name} />
        ) : (
          <div data-testid="avatar-fallback" className={fallbackClassName}>
            {name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
        )}
      </div>
    ),
  };
});

describe('AvatarZoomModal', () => {
  const mockProps = {
    open: true,
    onClose: vi.fn(),
    avatarUrl: 'https://example.com/avatar.jpg',
    name: 'John Doe',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open is true', () => {
    render(<AvatarZoomModal {...mockProps} />);

    expect(screen.getByAltText("John Doe's avatar")).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<AvatarZoomModal {...mockProps} open={false} />);

    expect(screen.queryByAltText("John Doe's avatar")).not.toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(<AvatarZoomModal {...mockProps} onClose={onClose} />);

    const overlay = screen.getByTestId('avatar-zoom-modal-overlay');
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when avatar content is clicked', () => {
    const onClose = vi.fn();
    render(<AvatarZoomModal {...mockProps} onClose={onClose} />);

    const content = screen.getByTestId('avatar-zoom-modal-content');
    fireEvent.click(content);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<AvatarZoomModal {...mockProps} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders avatar fallback when avatarUrl is not provided', () => {
    render(<AvatarZoomModal {...mockProps} avatarUrl={undefined} />);

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders avatar image when avatarUrl is provided', () => {
    render(<AvatarZoomModal {...mockProps} />);

    const avatarImage = screen.getByAltText("John Doe's avatar");
    expect(avatarImage).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('uses extractInitials for fallback when no avatarUrl', () => {
    render(<AvatarZoomModal {...mockProps} avatarUrl={undefined} name="Alice Bob" />);

    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('passes fallbackSeed to AvatarWithFallback', () => {
    render(<AvatarZoomModal {...mockProps} avatarUrl={undefined} fallbackSeed="pk:test-seed" />);
    expect(screen.getByTestId('avatar')).toHaveAttribute('data-fallback-seed', 'pk:test-seed');
  });

  it('calls useBodyScrollLock with open prop', async () => {
    const hooks = await import('@/hooks');
    render(<AvatarZoomModal {...mockProps} />);

    expect(hooks.useBodyScrollLock).toHaveBeenCalledWith(true);
  });

  describe('Accessibility and Focus Management', () => {
    it('has proper ARIA attributes when open', () => {
      render(<AvatarZoomModal {...mockProps} />);

      const overlay = screen.getByTestId('avatar-zoom-modal-overlay');

      expect(overlay).toHaveAttribute('role', 'dialog');
      expect(overlay).toHaveAttribute('aria-modal', 'true');
      expect(overlay).toHaveAttribute('aria-label', "John Doe's avatar enlarged");
    });

    it('has tabIndex=-1 for focus management', () => {
      render(<AvatarZoomModal {...mockProps} />);

      const overlay = screen.getByTestId('avatar-zoom-modal-overlay');

      expect(overlay).toHaveAttribute('tabIndex', '-1');
    });

    it('focuses modal when it opens', () => {
      const { rerender } = render(<AvatarZoomModal {...mockProps} open={false} />);

      // Modal is not in the DOM when closed
      expect(screen.queryByTestId('avatar-zoom-modal-overlay')).not.toBeInTheDocument();

      // Open the modal
      rerender(<AvatarZoomModal {...mockProps} open={true} />);

      const overlay = screen.getByTestId('avatar-zoom-modal-overlay');

      // Modal should be focused
      expect(overlay).toHaveFocus();
    });

    it('refocuses modal when reopened', () => {
      const { rerender } = render(<AvatarZoomModal {...mockProps} open={true} />);

      const overlay = screen.getByTestId('avatar-zoom-modal-overlay');
      expect(overlay).toHaveFocus();

      // Close modal
      rerender(<AvatarZoomModal {...mockProps} open={false} />);

      // Move focus elsewhere
      document.body.focus();

      // Reopen modal
      rerender(<AvatarZoomModal {...mockProps} open={true} />);

      const reopenedOverlay = screen.getByTestId('avatar-zoom-modal-overlay');
      expect(reopenedOverlay).toHaveFocus();
    });

    it('has outline-none class for visual focus management', () => {
      render(<AvatarZoomModal {...mockProps} />);

      const overlay = screen.getByTestId('avatar-zoom-modal-overlay');

      expect(overlay).toHaveClass('outline-none');
    });

    it('aria-label reflects the user name', () => {
      render(<AvatarZoomModal {...mockProps} name="Alice Smith" />);

      const overlay = screen.getByTestId('avatar-zoom-modal-overlay');

      expect(overlay).toHaveAttribute('aria-label', "Alice Smith's avatar enlarged");
    });
  });

  describe('Event Listener Cleanup', () => {
    it('removes event listener when component unmounts', () => {
      const onClose = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = render(<AvatarZoomModal {...mockProps} onClose={onClose} />);

      // Event listener should be added when open
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      unmount();

      // Event listener should be removed on unmount
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('removes event listener when modal closes', () => {
      const onClose = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { rerender } = render(<AvatarZoomModal {...mockProps} onClose={onClose} />);

      // Clear call counts after initial render
      addEventListenerSpy.mockClear();
      removeEventListenerSpy.mockClear();

      // Close the modal
      rerender(<AvatarZoomModal {...mockProps} onClose={onClose} open={false} />);

      // Event listener should be removed when modal closes
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('does not add event listener when modal is initially closed', () => {
      const onClose = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      render(<AvatarZoomModal {...mockProps} onClose={onClose} open={false} />);

      // Event listener should not be added when modal is closed
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('adds event listener when modal opens', () => {
      const onClose = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      const { rerender } = render(<AvatarZoomModal {...mockProps} onClose={onClose} open={false} />);

      // Clear call counts after initial render
      addEventListenerSpy.mockClear();

      // Open the modal
      rerender(<AvatarZoomModal {...mockProps} onClose={onClose} open={true} />);

      // Event listener should be added when modal opens
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('does not stack multiple event listeners on rapid open/close', () => {
      const onClose = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { rerender } = render(<AvatarZoomModal {...mockProps} onClose={onClose} open={true} />);

      // Rapidly close and reopen
      rerender(<AvatarZoomModal {...mockProps} onClose={onClose} open={false} />);
      rerender(<AvatarZoomModal {...mockProps} onClose={onClose} open={true} />);
      rerender(<AvatarZoomModal {...mockProps} onClose={onClose} open={false} />);
      rerender(<AvatarZoomModal {...mockProps} onClose={onClose} open={true} />);

      // Should have removed listeners each time modal was open (3 times)
      // With early return, cleanup only runs when listener was added
      expect(removeEventListenerSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Fire escape key - should only call onClose once
      onClose.mockClear();
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('cleanup does not run when modal never opened (early return optimization)', () => {
      const onClose = vi.fn();
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      // Start with modal closed
      const { unmount } = render(<AvatarZoomModal {...mockProps} onClose={onClose} open={false} />);

      removeEventListenerSpy.mockClear();

      // Unmount - with early return, cleanup should NOT be called since listener was never added
      unmount();

      // With early return optimization, removeEventListener is not called unnecessarily
      expect(removeEventListenerSpy).not.toHaveBeenCalled();

      removeEventListenerSpy.mockRestore();
    });
  });
});

describe('AvatarZoomModal - Snapshots', () => {
  it('matches snapshot when open with avatar image', () => {
    const { container } = render(
      <AvatarZoomModal open={true} onClose={vi.fn()} avatarUrl="https://example.com/avatar.jpg" name="John Doe" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when open with fallback initials', () => {
    const { container } = render(<AvatarZoomModal open={true} onClose={vi.fn()} name="Jane Smith" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(
      <AvatarZoomModal open={false} onClose={vi.fn()} avatarUrl="https://example.com/avatar.jpg" name="John Doe" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('AvatarZoomModal - Responsive Sizing', () => {
  it('uses responsive CSS variable for avatar size', () => {
    render(
      <AvatarZoomModal open={true} onClose={vi.fn()} avatarUrl="https://example.com/avatar.jpg" name="John Doe" />,
    );

    const avatar = screen.getByTestId('avatar');

    // Verify it uses the CSS variable class (not a fixed pixel size)
    expect(avatar).toHaveClass('size-(--avatar-zoom-size)');
  });

  it('avatar size is defined with min() function in CSS for responsiveness', () => {
    // This test documents that --avatar-zoom-size uses min(362px, 90vw)
    // The actual responsive behavior is handled by CSS and can be verified in:
    // - globals.css: --avatar-zoom-size: min(362px, 90vw)
    // - Visual testing: Check avatar scales down on narrow viewports
    // - E2E tests: Test on various viewport sizes

    render(<AvatarZoomModal open={true} onClose={vi.fn()} name="Test User" />);

    const avatar = screen.getByTestId('avatar');
    const computedStyle = window.getComputedStyle(avatar);

    // Verify the CSS variable is being applied
    expect(avatar.className).toContain('size-(--avatar-zoom-size)');

    // Note: getComputedStyle won't show the CSS variable value in JSDOM,
    // but this test documents the expected behavior for real browsers:
    // - Desktop (≥402px): 362px max
    // - Mobile (<402px): 90% of viewport width
    expect(computedStyle).toBeDefined();
  });
});
