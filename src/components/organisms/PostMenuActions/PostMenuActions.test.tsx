import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostMenuActions } from './PostMenuActions';

const mockUseIsMobile = vi.fn(() => false);
const mockUsePostMenuActions = vi.fn((_postId: string) => ({
  menuItems: [] as unknown[],
  isLoading: false,
}));
const mockRequireAuth = vi.fn((action: () => void) => action());

vi.mock('@/hooks', () => ({
  useIsMobile: () => mockUseIsMobile(),
  usePostMenuActions: (postId: string) => mockUsePostMenuActions(postId),
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mockRequireAuth,
  }),
}));

// Mock DialogReportPost and DialogEditPost
vi.mock('@/organisms', () => ({
  DialogReportPost: ({ open, postId }: { open: boolean; onOpenChange: (open: boolean) => void; postId: string }) => (
    <div data-testid="dialog-report-post" data-open={open.toString()} data-post-id={postId}>
      DialogReportPost
    </div>
  ),
  DialogEditPost: ({
    open,
    postId,
  }: {
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
    postId: string;
  }) => (
    <div data-testid="dialog-edit-post" data-open={open.toString()} data-post-id={postId}>
      DialogEditPost
    </div>
  ),
}));

vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
  };
});

vi.mock('./PostMenuActionsContent', () => ({
  PostMenuActionsContent: ({
    postId,
    variant,
    onActionComplete,
    onReportClick,
    onEditClick,
  }: {
    postId: string;
    variant: string;
    onActionComplete?: () => void;
    onReportClick?: () => void;
    onEditClick?: () => void;
  }) => (
    <div data-testid="post-menu-actions-content" data-post-id={postId} data-variant={variant}>
      <button onClick={onActionComplete}>Close</button>
      <button onClick={onReportClick} data-testid="report-button">
        Report
      </button>
      <button onClick={onEditClick} data-testid="edit-button">
        Edit
      </button>
    </div>
  ),
}));

vi.mock('@/atoms', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => (
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
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel} data-testid="button">
      {children}
    </button>
  ),
}));

describe('PostMenuActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('renders dropdown menu on desktop', () => {
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-content')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders sheet on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
  });

  it('passes correct variant to PostMenuActionsContent', () => {
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const content = screen.getByTestId('post-menu-actions-content');
    expect(content).toHaveAttribute('data-variant', 'dropdown');
  });

  it('passes sheet variant on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const content = screen.getByTestId('post-menu-actions-content');
    expect(content).toHaveAttribute('data-variant', 'sheet');
  });

  it('closes menu when action is completed', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const closeButton = screen.getByText('Close');
    await user.click(closeButton);

    const dropdown = screen.getByTestId('dropdown-menu');
    expect(dropdown).toHaveAttribute('data-open', 'false');
  });

  it('opens edit dialog when edit button is clicked', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const editButton = screen.getByTestId('edit-button');
    await user.click(editButton);

    const editDialog = screen.getByTestId('dialog-edit-post');
    expect(editDialog).toHaveAttribute('data-open', 'true');
    expect(editDialog).toHaveAttribute('data-post-id', 'pk:test123:post456');
  });

  it('does not open menu when edit button is clicked', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const editButton = screen.getByTestId('edit-button');
    await user.click(editButton);

    const dropdown = screen.getByTestId('dropdown-menu');
    expect(dropdown).toHaveAttribute('data-open', 'false');
  });

  it('requires authentication before opening the menu', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    await user.click(screen.getByTestId('dropdown-open-trigger'));

    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it('does not open menu when unauthenticated user clicks trigger', async () => {
    mockRequireAuth.mockImplementation(() => undefined);
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    await user.click(screen.getByTestId('dropdown-open-trigger'));

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(screen.getByTestId('dropdown-menu')).toHaveAttribute('data-open', 'false');
  });
});

describe('PostMenuActions - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('matches snapshot for desktop dropdown', () => {
    const trigger = <button>Menu</button>;
    const { container } = render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mobile sheet', () => {
    mockUseIsMobile.mockReturnValue(true);
    const trigger = <button>Menu</button>;
    const { container } = render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
