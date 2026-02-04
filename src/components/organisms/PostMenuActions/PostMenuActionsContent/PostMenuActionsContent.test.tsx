import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MENU_VARIANT } from '@/config/ui';
import { PostMenuActionsContent } from './PostMenuActionsContent';
import {
  POST_MENU_ACTION_IDS,
  POST_MENU_ACTION_VARIANTS,
} from '@/hooks/usePostMenuActions/usePostMenuActions.constants';
import type { PostMenuActionItem } from '@/hooks/usePostMenuActions/usePostMenuActions.types';

const mockUsePostMenuActions = vi.fn(() => ({
  menuItems: [] as PostMenuActionItem[],
  isLoading: false,
}));

vi.mock('@/hooks', () => ({
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

vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
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
}));

describe('PostMenuActionsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders menu items for own post', async () => {
    const Libs = await import('@/libs');
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Libs.Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Libs.Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: Libs.FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.EDIT,
          label: 'Edit post',
          icon: Libs.Edit,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.DELETE,
          label: 'Delete post',
          icon: Libs.Trash,
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
    const Libs = await import('@/libs');
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.FOLLOW,
          label: 'Follow Test User',
          icon: Libs.UserRoundPlus,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Libs.Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Libs.Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: Libs.FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.MUTE,
          label: 'Mute Test User',
          icon: Libs.MegaphoneOff,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.REPORT,
          label: 'Report post',
          icon: Libs.Flag,
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
      />,
    );

    expect(screen.getByText(/Follow/)).toBeInTheDocument();
    expect(screen.getByText(/Mute/)).toBeInTheDocument();
    expect(screen.getByText('Report post')).toBeInTheDocument();
    expect(screen.queryByText('Delete post')).not.toBeInTheDocument();
  });

  it('hides copy text for article posts', async () => {
    const Libs = await import('@/libs');
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.FOLLOW,
          label: 'Follow Test User',
          icon: Libs.UserRoundPlus,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Libs.Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Libs.Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.MUTE,
          label: 'Mute Test User',
          icon: Libs.MegaphoneOff,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.REPORT,
          label: 'Report post',
          icon: Libs.Flag,
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
    const Libs = await import('@/libs');
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.FOLLOW,
          label: 'Follow Test User',
          icon: Libs.UserRoundPlus,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Libs.Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Libs.Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: Libs.FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.MUTE,
          label: 'Mute Test User',
          icon: Libs.MegaphoneOff,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.REPORT,
          label: 'Report post',
          icon: Libs.Flag,
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
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for own post menu items', async () => {
    const Libs = await import('@/libs');
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Libs.Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Libs.Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: Libs.FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.EDIT,
          label: 'Edit post',
          icon: Libs.Edit,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.DELETE,
          label: 'Delete post',
          icon: Libs.Trash,
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
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mobile sheet variant', async () => {
    const Libs = await import('@/libs');
    mockUsePostMenuActions.mockReturnValue({
      menuItems: [
        {
          id: POST_MENU_ACTION_IDS.FOLLOW,
          label: 'Follow Test User',
          icon: Libs.UserRoundPlus,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_PUBKY,
          label: 'Copy pubky',
          icon: Libs.Key,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_LINK,
          label: 'Copy link to post',
          icon: Libs.Link,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.COPY_TEXT,
          label: 'Copy text of post',
          icon: Libs.FileText,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.MUTE,
          label: 'Mute Test User',
          icon: Libs.MegaphoneOff,
          onClick: vi.fn(),
          variant: POST_MENU_ACTION_VARIANTS.DEFAULT,
        },
        {
          id: POST_MENU_ACTION_IDS.REPORT,
          label: 'Report post',
          icon: Libs.Flag,
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
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
