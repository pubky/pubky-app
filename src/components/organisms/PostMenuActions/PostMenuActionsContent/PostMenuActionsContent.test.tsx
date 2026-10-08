import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Edit, FileText, Flag, Key, Link, MegaphoneOff, Trash, UserRoundPlus } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_VARIANT } from '@/config/ui';
import {
  POST_MENU_ACTION_IDS,
  POST_MENU_ACTION_VARIANTS,
} from '@/hooks/usePostMenuActions/usePostMenuActions.constants';
import type { PostMenuActionItem } from '@/hooks/usePostMenuActions/usePostMenuActions.types';
import { PostMenuActionsContent } from './PostMenuActionsContent';

vi.mock('@/atoms/DropdownMenu/DropdownMenu', () => {
  return {
    DropdownMenuItem: ({
      children,
      onClick,
      disabled,
      className,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      className?: string;
    }) => (
      <div
        onClick={disabled ? undefined : onClick}
        className={className}
        data-testid="dropdown-menu-item"
        data-disabled={disabled ? 'true' : 'false'}
      >
        {children}
      </div>
    ),
  };
});

const mockUsePostMenuActions = vi.fn(() => ({
  menuItems: [] as PostMenuActionItem[],
  isLoading: false,
}));

vi.mock('@/hooks/usePostMenuActions/usePostMenuActions', () => ({
  usePostMenuActions: (_postId: string) => mockUsePostMenuActions(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({ currentUserPubky: 'pk:current123' })),
}));
vi.mock('@/models/models.utils', () => ({
  parseCompositeId: vi.fn((id: string) => {
    const [pubky, postId] = id.split(':');
    return { pubky, id: postId };
  }),
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    delete: vi.fn(),
  },
}));

vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      disabled,
      className,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      className?: string;
    }) => (
      <button onClick={onClick} disabled={disabled} className={className} data-testid="menu-button">
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
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div
        data-testid="container"
        data-class-name={className}
        data-override-defaults={overrideDefaults ? 'true' : 'false'}
      >
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
    }) => (
      <span data-testid="typography" className={className}>
        {children}
      </span>
    ),
  };
});

describe('PostMenuActionsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders menu items for own post', async () => {
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.EDIT,
          label: 'Edit post',
          icon: Edit,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.DELETE,
          label: 'Delete post',
          icon: Trash,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DESTRUCTIVE,
        },
      ],
      isLoading: false,
    });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.DROPDOWN}
        onActionComplete={vi.fn()}
        onReportClick={vi.fn()}
        onEditClick={vi.fn()}
        onDeleteClick={vi.fn()}
        isDeleting={false}
      />,
    );

    expect(screen.getByText('Copy pubky')).toBeInTheDocument();
    expect(screen.getByText('Copy link to post')).toBeInTheDocument();
    expect(screen.getByText('Copy text of post')).toBeInTheDocument();
    expect(screen.getByText('Edit post')).toBeInTheDocument();
    expect(screen.getByText('Delete post')).toBeInTheDocument();
    expect(screen.queryByText(/Follow|Unfollow/)).not.toBeInTheDocument();
  });

  it('renders menu items for other user post', async () => {
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.FOLLOW,
          label: 'Follow Test User',
          icon: UserRoundPlus,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.MUTE,
          label: 'Mute Test User',
          icon: MegaphoneOff,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.REPORT,
          label: 'Report post',
          icon: Flag,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
      ],
      isLoading: false,
    });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.DROPDOWN}
        onActionComplete={vi.fn()}
        onReportClick={vi.fn()}
        onEditClick={vi.fn()}
        onDeleteClick={vi.fn()}
        isDeleting={false}
      />,
    );

    expect(screen.getByText(/Follow/)).toBeInTheDocument();
    expect(screen.getByText(/Mute/)).toBeInTheDocument();
    expect(screen.getByText('Report post')).toBeInTheDocument();
    expect(screen.queryByText('Delete post')).not.toBeInTheDocument();
  });

  it('hides copy text for article posts', async () => {
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.FOLLOW,
          label: 'Follow Test User',
          icon: UserRoundPlus,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.MUTE,
          label: 'Mute Test User',
          icon: MegaphoneOff,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.REPORT,
          label: 'Report post',
          icon: Flag,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
      ],
      isLoading: false,
    });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.DROPDOWN}
        onActionComplete={vi.fn()}
        onReportClick={vi.fn()}
        onEditClick={vi.fn()}
        onDeleteClick={vi.fn()}
        isDeleting={false}
      />,
    );

    expect(screen.queryByText('Copy text of post')).not.toBeInTheDocument();
  });

  const callbackProps = {
    onReportClick: vi.fn(),
    onEditClick: vi.fn(),
    onDeleteClick: vi.fn(),
    isDeleting: false,
  };

  const twoItems = () => [
    {
      id: POST_MENU_ACTION_IDS.COPY_LINK,
      label: 'Copy link to post',
      icon: Link,
      onClick: vi.fn(),
      variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
    },
    {
      id: POST_MENU_ACTION_IDS.DELETE,
      label: 'Delete post',
      icon: Trash,
      onClick: vi.fn(),
      variant: POST_MENU_ACTION_VARIANTS.DESTRUCTIVE,
      disabled: true,
    },
  ];

  it('renders dropdown menu items for the dropdown variant', () => {
    mockUsePostMenuActions.mockReturnValue({ menuItems: twoItems(), isLoading: false });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.DROPDOWN}
        onActionComplete={vi.fn()}
        {...callbackProps}
      />,
    );

    const items = screen.getAllByTestId('dropdown-menu-item');
    expect(items).toHaveLength(2);
    expect(screen.queryByTestId('menu-button')).not.toBeInTheDocument();
    expect(items[1]).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByText('Delete post')).toHaveClass('text-destructive');
    expect(screen.getByText('Copy link to post')).toHaveClass('text-muted-foreground');
  });

  it('renders ghost buttons for the sheet variant', () => {
    mockUsePostMenuActions.mockReturnValue({ menuItems: twoItems(), isLoading: false });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.SHEET}
        onActionComplete={vi.fn()}
        {...callbackProps}
      />,
    );

    const buttons = screen.getAllByTestId('menu-button');
    expect(buttons).toHaveLength(2);
    expect(screen.queryByTestId('dropdown-menu-item')).not.toBeInTheDocument();
    expect(buttons[0]).toHaveClass('justify-start');
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText('Delete post')).toHaveClass('text-destructive');
  });

  it('runs the item action then calls onActionComplete', async () => {
    const items = twoItems();
    const onActionComplete = vi.fn();
    mockUsePostMenuActions.mockReturnValue({ menuItems: items, isLoading: false });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.SHEET}
        onActionComplete={onActionComplete}
        {...callbackProps}
      />,
    );

    fireEvent.click(screen.getByText('Copy link to post'));

    await waitFor(() => {
      expect(onActionComplete).toHaveBeenCalledTimes(1);
    });
    expect(items[0].onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the skeleton while loading', () => {
    mockUsePostMenuActions.mockReturnValue({ menuItems: [], isLoading: true });

    render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.DROPDOWN}
        onActionComplete={vi.fn()}
        {...callbackProps}
      />,
    );

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('dropdown-menu-item')).not.toBeInTheDocument();
  });
});
