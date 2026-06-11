import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { ProfileMenuActions } from './ProfileMenuActions';

vi.mock('@/atoms/DropdownMenu/DropdownMenu', () => {
  return {
    DropdownMenu: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => (
      <div data-testid="dropdown-menu" data-open={open.toString()}>
        <button data-testid="dropdown-open-trigger" onClick={() => onOpenChange(true)} />
        {children}
      </div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dropdown-trigger">{children}</div>
    ),
    DropdownMenuContent: ({
      children,
      align,
      className,
    }: {
      children: React.ReactNode;
      align: string;
      className?: string;
      onCloseAutoFocus?: (e: { preventDefault: () => void }) => void;
    }) => (
      <div data-testid="dropdown-content" data-align={align} className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Sheet/Sheet', () => {
  return {
    Sheet: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => (
      <div data-testid="sheet" data-open={open.toString()}>
        {children}
      </div>
    ),
    SheetTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="sheet-trigger">{children}</div>
    ),
    SheetContent: ({
      children,
      side,
    }: {
      children: React.ReactNode;
      side: string;
      onOpenAutoFocus?: (e: { preventDefault: () => void }) => void;
    }) => (
      <div data-testid="sheet-content" data-side={side}>
        {children}
      </div>
    ),
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet-header">{children}</div>,
    SheetTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="sheet-title" className={className}>
        {children}
      </div>
    ),
  };
});

const { mockUseIsMobile, mockUseProfileMenuActions, mockRequireAuth } = vi.hoisted(() => ({
  mockUseIsMobile: vi.fn(() => false),
  mockUseProfileMenuActions: vi.fn((_userId: string) => ({
    menuItems: [] as unknown[],
    isLoading: false,
  })),
  mockRequireAuth: vi.fn((action: () => void) => action()),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useProfileMenuActions/useProfileMenuActions', () => ({
  useProfileMenuActions: (userId: string) => mockUseProfileMenuActions(userId),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mockRequireAuth,
  }),
}));

vi.mock('./ProfileMenuActionsContent/ProfileMenuActionsContent', () => ({
  ProfileMenuActionsContent: ({
    userId,
    variant,
    onActionComplete,
  }: {
    userId: string;
    variant: string;
    onActionComplete?: () => void;
  }) => (
    <div data-testid="profile-menu-actions-content" data-user-id={userId} data-variant={variant}>
      <button onClick={onActionComplete}>Close</button>
    </div>
  ),
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

describe('ProfileMenuActions - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('matches snapshot for desktop dropdown', () => {
    const trigger = <button>Menu</button>;
    const { container } = render(<ProfileMenuActions userId="pk:test123" trigger={trigger} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfileMenuActions - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const trigger = <button>Menu</button>;
    const { container } = render(<ProfileMenuActions userId="pk:test123" trigger={trigger} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
