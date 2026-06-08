import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewPostCTA } from './NewPostCTA';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div data-testid="dialog" data-open={open} onClick={() => onOpenChange?.(true)}>
        {children}
      </div>
    ),
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dialog-trigger" data-as-child={asChild}>
        {children}
      </div>
    ),
  };
});

// Mock hooks - default to authenticated user
const mockUseAuthStatus = vi.fn(() => ({
  isFullyAuthenticated: true,
  isLoading: false,
  status: 'AUTHENTICATED',
  hasKeypair: true,
  hasProfile: true,
}));

const mockIsPublicRoute = vi.fn(() => false);
const mockIsPublicExploreRoute = vi.fn(() => false);
const mockRequireAuth = vi.fn((action: () => void) => action());

vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({
  useAuthStatus: () => mockUseAuthStatus(),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isPublicRoute: mockIsPublicRoute(),
    isDynamicPublicRoute: mockIsPublicRoute(),
    isCoreExploreRoute: mockIsPublicExploreRoute() && !mockIsPublicRoute(),
    isPublicExploreRoute: mockIsPublicExploreRoute(),
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mockUseAuthStatus().isFullyAuthenticated,
    requireAuth: mockRequireAuth,
  }),
}));

// Mock organisms
vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => {
  return {
    DialogNewPost: vi.fn(
      ({ open, onOpenChangeAction }: { open: boolean; onOpenChangeAction: (open: boolean) => void }) => (
        <div data-testid="dialog-new-post" data-open={open}>
          <button data-testid="mock-close-btn" onClick={() => onOpenChangeAction(false)}>
            Close
          </button>
        </div>
      ),
    ),
  };
});

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      className,
      'data-testid': dataTestId,
      'aria-label': ariaLabel,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      'data-testid'?: string;
      'aria-label'?: string;
      [key: string]: unknown;
    }) => (
      <button data-testid={dataTestId} className={className} aria-label={ariaLabel} {...props}>
        {children}
      </button>
    ),
  };
});

// Use real libs

describe('NewPostCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to authenticated state for most tests
    mockUseAuthStatus.mockReturnValue({
      isFullyAuthenticated: true,
      isLoading: false,
      status: 'AUTHENTICATED',
      hasKeypair: true,
      hasProfile: true,
    });
    mockIsPublicRoute.mockReturnValue(false);
    mockIsPublicExploreRoute.mockReturnValue(false);
    mockRequireAuth.mockImplementation((action: () => void) => action());
  });

  it('renders button with correct test id', () => {
    render(<NewPostCTA />);
    expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
  });

  it('returns null when user is not authenticated and not on public route', () => {
    mockUseAuthStatus.mockReturnValue({
      isFullyAuthenticated: false,
      isLoading: false,
      status: 'UNAUTHENTICATED',
      hasKeypair: false,
      hasProfile: false,
    });
    mockIsPublicRoute.mockReturnValue(false);
    mockIsPublicExploreRoute.mockReturnValue(false);

    const { container } = render(<NewPostCTA />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null while loading auth status', () => {
    mockUseAuthStatus.mockReturnValue({
      isFullyAuthenticated: false,
      isLoading: true,
      status: 'UNAUTHENTICATED',
      hasKeypair: false,
      hasProfile: false,
    });
    const { container } = render(<NewPostCTA />);
    expect(container.firstChild).toBeNull();
  });

  it('opens dialog when button is clicked by authenticated user', () => {
    render(<NewPostCTA />);
    const button = screen.getByTestId('new-post-cta');
    const dialog = screen.getByTestId('dialog');

    expect(dialog).toHaveAttribute('data-open', 'false');

    fireEvent.click(button);

    // Dialog should be opened (state managed internally)
    expect(screen.getByTestId('dialog-new-post')).toBeInTheDocument();
  });

  describe('Public Route Behavior', () => {
    it('renders button when unauthenticated on public route', () => {
      mockUseAuthStatus.mockReturnValue({
        isFullyAuthenticated: false,
        isLoading: false,
        status: 'UNAUTHENTICATED',
        hasKeypair: false,
        hasProfile: false,
      });
      mockIsPublicRoute.mockReturnValue(true);
      mockIsPublicExploreRoute.mockReturnValue(true);

      render(<NewPostCTA />);

      expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
    });

    it('calls requireAuth when unauthenticated user clicks button', () => {
      mockUseAuthStatus.mockReturnValue({
        isFullyAuthenticated: false,
        isLoading: false,
        status: 'UNAUTHENTICATED',
        hasKeypair: false,
        hasProfile: false,
      });
      mockIsPublicRoute.mockReturnValue(true);
      mockIsPublicExploreRoute.mockReturnValue(true);
      mockRequireAuth.mockImplementation(() => undefined); // Simulates showing sign-in dialog

      render(<NewPostCTA />);

      const button = screen.getByTestId('new-post-cta');
      fireEvent.click(button);

      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    });

    it('does not render dialog wrapper for unauthenticated users', () => {
      mockUseAuthStatus.mockReturnValue({
        isFullyAuthenticated: false,
        isLoading: false,
        status: 'UNAUTHENTICATED',
        hasKeypair: false,
        hasProfile: false,
      });
      mockIsPublicRoute.mockReturnValue(true);
      mockIsPublicExploreRoute.mockReturnValue(true);

      render(<NewPostCTA />);

      expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('NewPostCTA - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to authenticated state for snapshot tests
    mockUseAuthStatus.mockReturnValue({
      isFullyAuthenticated: true,
      isLoading: false,
      status: 'AUTHENTICATED',
      hasKeypair: true,
      hasProfile: true,
    });
    mockIsPublicRoute.mockReturnValue(false);
    mockIsPublicExploreRoute.mockReturnValue(false);
    mockRequireAuth.mockImplementation((action: () => void) => action());
  });

  it('matches snapshot with default state', () => {
    const { container } = render(<NewPostCTA />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
