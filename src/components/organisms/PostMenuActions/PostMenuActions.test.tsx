import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { PostMenuActions } from './PostMenuActions';

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

const { mockUseIsMobile, mockDeletePost, mockUsePostMenuActions, mockRequireAuth } = vi.hoisted(() => ({
  mockUseIsMobile: vi.fn(() => false),
  mockDeletePost: vi.fn(),
  mockUsePostMenuActions: vi.fn((_postId: string) => ({
    menuItems: [] as unknown[],
    isLoading: false,
  })),
  mockRequireAuth: vi.fn((action: () => void) => action()),
}));
const mockUsePostDetails = vi.fn((_postId: string) => ({
  postDetails: { kind: 'short' } as { kind: string } | null,
  isLoading: false,
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/usePostMenuActions/usePostMenuActions', () => ({
  usePostMenuActions: (postId: string) => mockUsePostMenuActions(postId),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mockRequireAuth,
  }),
}));

vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: vi.fn(() => ({
    deletePost: mockDeletePost,
    isDeleting: false,
  })),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: (postId: string) => mockUsePostDetails(postId),
}));

// Mock DialogReportPost and DialogEditPost
vi.mock('@/organisms/DialogEditPost/DialogEditPost', () => {
  return {
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
  };
});

vi.mock('@/organisms/DialogReportPost/DialogReportPost', () => {
  return {
    DialogReportPost: ({ open, postId }: { open: boolean; onOpenChange: (open: boolean) => void; postId: string }) => (
      <div data-testid="dialog-report-post" data-open={open.toString()} data-post-id={postId}>
        DialogReportPost
      </div>
    ),
  };
});

vi.mock('@/organisms/EditCollectionDialog/EditCollectionDialog', () => ({
  EditCollectionDialog: ({
    open,
    compositeCollectionId,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    compositeCollectionId: string;
  }) => (
    <div data-testid="edit-collection-dialog" data-open={open.toString()} data-collection-id={compositeCollectionId}>
      EditCollectionDialog
    </div>
  ),
}));

vi.mock('@/molecules/DialogConfirmDelete/DialogConfirmDelete', () => {
  return {
    DialogConfirmDelete: ({
      open,
      onConfirm,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onConfirm: () => void;
    }) => (
      <div data-testid="dialog-confirm-delete" data-open={open.toString()}>
        <button onClick={onConfirm} data-testid="confirm-delete-button">
          Confirm Delete
        </button>
      </div>
    ),
  };
});

vi.mock('./PostMenuActionsContent/PostMenuActionsContent', () => ({
  PostMenuActionsContent: ({
    postId,
    variant,
    onActionComplete,
    onReportClick,
    onEditClick,
    onDeleteClick,
  }: {
    postId: string;
    variant: string;
    onActionComplete?: () => void;
    onReportClick?: () => void;
    onEditClick?: () => void;
    onDeleteClick?: () => void;
    isDeleting?: boolean;
  }) => (
    <div data-testid="post-menu-actions-content" data-post-id={postId} data-variant={variant}>
      <button onClick={onActionComplete}>Close</button>
      <button onClick={onReportClick} data-testid="report-button">
        Report
      </button>
      <button onClick={onEditClick} data-testid="edit-button">
        Edit
      </button>
      <button onClick={onDeleteClick} data-testid="delete-button">
        Delete
      </button>
    </div>
  ),
}));

vi.mock('@/atoms/Button/Button', () => {
  return {
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
  };
});

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

describe('PostMenuActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    mockUsePostDetails.mockReturnValue({ postDetails: { kind: 'short' }, isLoading: false });
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

  it('opens delete confirmation dialog when delete button is clicked', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    const confirmDialog = screen.getByTestId('dialog-confirm-delete');
    expect(confirmDialog).toHaveAttribute('data-open', 'true');
  });

  it('closes menu when delete button is clicked', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    const dropdown = screen.getByTestId('dropdown-menu');
    expect(dropdown).toHaveAttribute('data-open', 'false');
  });

  it('calls deletePost when delete is confirmed', async () => {
    const user = userEvent.setup();
    const trigger = <button>Menu</button>;
    render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    const confirmButton = screen.getByTestId('confirm-delete-button');
    await user.click(confirmButton);

    expect(mockDeletePost).toHaveBeenCalledWith('pk:test123:post456');
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

  describe('edit dialog routing by post kind', () => {
    it('renders DialogEditPost (and not EditCollectionDialog) for short posts', () => {
      mockUsePostDetails.mockReturnValue({ postDetails: { kind: 'short' }, isLoading: false });
      const trigger = <button>Menu</button>;
      render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

      expect(screen.getByTestId('dialog-edit-post')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-collection-dialog')).not.toBeInTheDocument();
    });

    it('renders DialogEditPost (not EditCollectionDialog) for long-form articles', () => {
      mockUsePostDetails.mockReturnValue({ postDetails: { kind: 'long' }, isLoading: false });
      const trigger = <button>Menu</button>;
      render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

      expect(screen.getByTestId('dialog-edit-post')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-collection-dialog')).not.toBeInTheDocument();
    });

    it('renders EditCollectionDialog (not DialogEditPost) for collection posts', () => {
      mockUsePostDetails.mockReturnValue({ postDetails: { kind: 'collection' }, isLoading: false });
      const trigger = <button>Menu</button>;
      render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

      const dialog = screen.getByTestId('edit-collection-dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('data-collection-id', 'pk:test123:post456');
      expect(screen.queryByTestId('dialog-edit-post')).not.toBeInTheDocument();
    });

    it('opens the EditCollectionDialog when Edit is clicked on a collection post', async () => {
      mockUsePostDetails.mockReturnValue({ postDetails: { kind: 'collection' }, isLoading: false });
      const user = userEvent.setup();
      const trigger = <button>Menu</button>;
      render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

      const editButton = screen.getByTestId('edit-button');
      await user.click(editButton);

      const dialog = screen.getByTestId('edit-collection-dialog');
      expect(dialog).toHaveAttribute('data-open', 'true');
      expect(dialog).toHaveAttribute('data-collection-id', 'pk:test123:post456');
    });

    it('falls back to DialogEditPost when post details have not loaded yet', () => {
      mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: true });
      const trigger = <button>Menu</button>;
      render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);

      expect(screen.getByTestId('dialog-edit-post')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-collection-dialog')).not.toBeInTheDocument();
    });
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
});

describe('PostMenuActions - Mobile Snapshots', () => {
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
    const { container } = render(<PostMenuActions postId="pk:test123:post456" trigger={trigger} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
