import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Edit, FileText, Flag, Key, Link, MegaphoneOff, Trash, UserRoundPlus } from 'lucide-react';
import { MENU_VARIANT } from '@/config/ui';
import { PostMenuActionsContent } from './PostMenuActionsContent';
import type { PostMenuActionItem } from '@/hooks/usePostMenuActions/usePostMenuActions.types';

import {
  POST_MENU_ACTION_IDS,
  POST_MENU_ACTION_VARIANTS,
} from '@/hooks/usePostMenuActions/usePostMenuActions.constants';

const mockUsePostMenuActions = vi.fn(() => ({
  menuItems: [] as PostMenuActionItem[],
  isLoading: false,
}));

vi.mock('@/hooks/usePostMenuActions/usePostMenuActions', () => ({
  usePostMenuActions: (_postId: string) => mockUsePostMenuActions(),
}));

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useAuthStore: vi.fn(() => ({ currentUserPubky: 'pk:current123' })),
    parseCompositeId: vi.fn((id: string) => {
      const [pubky, postId] = id.split(':');
      return { pubky, id: postId };
    }),
    PostController: {
      delete: vi.fn(),
    },
  };
});

vi.mock('@/atoms', () => ({
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
  Typography: ({ children, className }: { children: React.ReactNode; as?: React.ElementType; className?: string }) => (
    <span data-testid="typography" className={className}>
      {children}
    </span>
  ),
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

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
});

describe('PostMenuActionsContent - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for all menu items visible (other user post)', async () => {
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

    const { container } = render(
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
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for own post menu items', async () => {
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

    const { container } = render(
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
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mobile sheet variant', async () => {
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

    const { container } = render(
      <PostMenuActionsContent
        postId="pk:test123:post456"
        variant={MENU_VARIANT.SHEET}
        onActionComplete={vi.fn()}
        onReportClick={vi.fn()}
        onEditClick={vi.fn()}
        onDeleteClick={vi.fn()}
        isDeleting={false}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
