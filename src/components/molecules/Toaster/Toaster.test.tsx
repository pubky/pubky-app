import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from './Toaster';

// Mock the useToast hook
const mockUseToast = vi.fn();
vi.mock('./use-toast', () => ({
  useToast: () => mockUseToast(),
}));

describe('Toaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render empty when no toasts', () => {
    mockUseToast.mockReturnValue({
      toasts: [],
    });

    const { container } = render(<Toaster />);

    // Should render ToastProvider structure even with no toasts
    expect(container.firstChild).toBeTruthy();
  });

  it('should render toast without title when only description is provided', () => {
    const mockToast = {
      id: '1',
      description: 'Just a description',
      open: true,
    };

    mockUseToast.mockReturnValue({
      toasts: [mockToast],
    });

    render(<Toaster />);

    expect(screen.getByText('Just a description')).toBeInTheDocument();
  });

  it('should wrap long description text instead of truncating', () => {
    const longDescription =
      'The file you are trying to upload exceeds the maximum allowed size of 100MB. Please reduce the file size and try again.';

    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: 'long-desc',
          title: 'Upload Error',
          description: longDescription,
          open: true,
        },
      ],
    });

    render(<Toaster />);

    const descriptionElement = screen.getByText(longDescription);
    expect(descriptionElement).toHaveClass('wrap-anywhere');
    expect(descriptionElement).not.toHaveClass('truncate');
  });

  it('should wrap long URL description when dismiss button is shown', () => {
    const longUrl = `https://pubky-ring-signer.example.com/auth?redirect=${'a'.repeat(120)}`;

    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: 'copy-link',
          title: 'Link copied to clipboard',
          description: longUrl,
          dismissButton: true,
          open: true,
        },
      ],
      dismiss: vi.fn(),
    });

    render(<Toaster />);

    expect(screen.getByText(longUrl)).toHaveClass('wrap-anywhere');
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('should render dismiss button when dismissButton is true', () => {
    const mockDismiss = vi.fn();
    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: 'dismiss-toast',
          title: 'Success',
          description: 'Operation completed',
          dismissButton: true,
          open: true,
        },
      ],
      dismiss: mockDismiss,
    });

    render(<Toaster />);

    const okButton = screen.getByRole('button', { name: 'OK' });
    expect(okButton).toBeInTheDocument();

    fireEvent.click(okButton);
    expect(mockDismiss).toHaveBeenCalledWith('dismiss-toast');
  });

  it('should not render dismiss button when dismissButton is not set', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: 'no-dismiss',
          title: 'Simple toast',
          open: true,
        },
      ],
      dismiss: vi.fn(),
    });

    render(<Toaster />);

    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('should handle complex toast with action button click', () => {
    const handleActionClick = vi.fn();
    const mockAction = (
      <button data-testid="toast-action" onClick={handleActionClick}>
        Retry
      </button>
    );

    const mockToast = {
      id: 'complex-toast',
      title: 'Upload Failed',
      description: 'There was an error uploading your file. Please try again.',
      action: mockAction,
      className: 'bg-red-500 border-red-600',
      'data-testid': 'error-toast',
      open: true,
    };

    mockUseToast.mockReturnValue({
      toasts: [mockToast],
    });

    render(<Toaster />);

    // Check all elements are rendered
    expect(screen.getByText('Upload Failed')).toBeInTheDocument();
    expect(screen.getByText('There was an error uploading your file. Please try again.')).toBeInTheDocument();
    expect(screen.getByTestId('toast-action')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Check custom props are applied
    const toastElement = screen.getByTestId('error-toast');
    expect(toastElement).toBeInTheDocument();

    // Test action button functionality
    fireEvent.click(screen.getByTestId('toast-action'));
    expect(handleActionClick).toHaveBeenCalledTimes(1);
  });
});

describe('Toaster - Snapshots', () => {
  it('matches snapshot for empty Toaster', () => {
    mockUseToast.mockReturnValue({
      toasts: [],
    });

    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with single toast', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: '1',
          title: 'Test Toast',
          description: 'This is a test toast message',
          open: true,
        },
      ],
    });

    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with title-only toast', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: '1',
          title: 'Simple Toast',
          open: true,
        },
      ],
    });

    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with toast with action', () => {
    const mockAction = (
      <button data-testid="custom-action" onClick={() => {}}>
        Undo
      </button>
    );

    const mockToast = {
      id: '1',
      title: 'Toast with Action',
      description: 'This toast has an action button',
      action: mockAction,
      open: true,
    };

    mockUseToast.mockReturnValue({
      toasts: [mockToast],
    });

    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with toast action', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: '1',
          title: 'Toast with Action',
          description: 'This toast has an action button',
          action: <button>Undo</button>,
          open: true,
        },
      ],
    });

    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with multiple toasts', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        {
          id: '1',
          title: 'First Toast',
          description: 'First description',
          open: true,
        },
        {
          id: '2',
          title: 'Second Toast',
          description: 'Second description',
          open: true,
        },
      ],
    });

    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
