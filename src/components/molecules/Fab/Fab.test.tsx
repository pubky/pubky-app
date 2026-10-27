import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_ROUTES } from '@/app/routes';
import type { FabAction } from '@/hooks/useFabAction/useFabAction.types';
import { useCollectionReorderStore } from '@/stores/collectionReorder/collectionReorder.store';
import { useContextualBannerStore } from '@/stores/contextualBanner/contextualBanner.store';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE } from '@/test-utils/pubky';
import { Fab } from './Fab';

const mockUseAuthStatus = vi.fn(() => ({
  isFullyAuthenticated: true,
  isLoading: false,
  status: 'AUTHENTICATED',
  hasKeypair: true,
  hasProfile: true,
}));
const mockIsPublicExploreRoute = vi.fn(() => false);
const mockRequireAuth = vi.fn((action: () => void) => action());
const mockUseFabAction = vi.fn<() => FabAction>(() => ({ kind: 'createPost', ariaLabel: 'New post' }));
const mockUseKeyboardVisible = vi.fn(() => false);

vi.mock('@/hooks/useKeyboardVisible/useKeyboardVisible', () => ({
  useKeyboardVisible: () => mockUseKeyboardVisible(),
}));

const mockUsePathname = vi.fn(() => '/home');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({
  useAuthStatus: () => mockUseAuthStatus(),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isPublicRoute: false,
    isDynamicPublicRoute: false,
    isCoreExploreRoute: mockIsPublicExploreRoute(),
    isPublicExploreRoute: mockIsPublicExploreRoute(),
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mockUseAuthStatus().isFullyAuthenticated,
    requireAuth: mockRequireAuth,
  }),
}));

vi.mock('@/hooks/useFabAction/useFabAction', () => ({
  useFabAction: () => mockUseFabAction(),
}));

vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => ({
  DialogNewPost: ({
    open,
    onOpenChangeAction,
    onPostCreated,
  }: {
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
    onPostCreated?: (createdPostId: string) => void;
  }) => (
    <div data-testid="dialog-new-post" data-open={open} data-has-on-post-created={String(Boolean(onPostCreated))}>
      <button data-testid="mock-close-btn" onClick={() => onOpenChangeAction(false)}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@/organisms/Collections/DialogNewCollection/DialogNewCollection', () => ({
  DialogNewCollection: ({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) => (
    <div data-testid="new-collection-dialog" data-open={open}>
      <button data-testid="mock-collection-close-btn" onClick={() => onOpenChange?.(false)}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@/atoms/Button/Button', () => ({
  Button: ({
    children,
    className,
    overrideDefaults,
    'data-testid': dataTestId,
    'aria-label': ariaLabel,
    ...props
  }: {
    children: ReactNode;
    className?: string;
    overrideDefaults?: boolean;
    'data-testid'?: string;
    'aria-label'?: string;
    [key: string]: unknown;
  }) => (
    <button
      data-testid={dataTestId}
      className={className}
      aria-label={ariaLabel}
      data-override-defaults={overrideDefaults}
      {...props}
    >
      {children}
    </button>
  ),
}));

describe('Fab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseKeyboardVisible.mockReturnValue(false);
    mockUseAuthStatus.mockReturnValue({
      isFullyAuthenticated: true,
      isLoading: false,
      status: 'AUTHENTICATED',
      hasKeypair: true,
      hasProfile: true,
    });
    mockIsPublicExploreRoute.mockReturnValue(false);
    mockRequireAuth.mockImplementation((action: () => void) => action());
    mockUseFabAction.mockReturnValue({ kind: 'createPost', ariaLabel: 'New post' });
    mockUsePathname.mockReturnValue('/home');
    useCollectionReorderStore.setState({ activeCollectionId: null });
  });

  it.each([
    ['createPost', 'dialog-new-post'],
    ['createCollection', 'new-collection-dialog'],
  ] as const)('preserves the open %s dialog across keyboard visibility changes', (kind, dialogTestId) => {
    mockUseFabAction.mockReturnValue({ kind, ariaLabel: 'Create' });
    const { rerender } = render(<Fab />);
    fireEvent.click(screen.getByTestId('new-post-cta'));
    const dialog = screen.getByTestId(dialogTestId);
    expect(dialog).toHaveAttribute('data-open', 'true');

    mockUseKeyboardVisible.mockReturnValue(true);
    rerender(<Fab />);
    expect(screen.getByTestId('new-post-cta')).toHaveClass('hidden', 'lg:flex');
    expect(screen.getByTestId(dialogTestId)).toBe(dialog);
    expect(dialog).toHaveAttribute('data-open', 'true');

    mockUseKeyboardVisible.mockReturnValue(false);
    rerender(<Fab />);
    expect(screen.getByTestId('new-post-cta')).not.toHaveClass('hidden');
    expect(screen.getByTestId(dialogTestId)).toBe(dialog);
    expect(dialog).toHaveAttribute('data-open', 'true');
  });

  it('renders the button with the stable test/cypress ids and the action aria-label', () => {
    render(<Fab />);
    const button = screen.getByTestId('new-post-cta');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-cy', 'new-post-btn');
    expect(button).toHaveAttribute('aria-label', 'New post');
  });

  it('returns null while a collection is in reorder mode', () => {
    useCollectionReorderStore.setState({ activeCollectionId: 'author:collection123' });
    const { container } = render(<Fab />);
    expect(container.firstChild).toBeNull();
  });

  it('reappears when reorder mode exits', () => {
    useCollectionReorderStore.setState({ activeCollectionId: 'author:collection123' });
    const { container } = render(<Fab />);
    expect(container.firstChild).toBeNull();

    act(() => useCollectionReorderStore.getState().exit());

    expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
  });

  it('returns null when unauthenticated and not on a public explore route', () => {
    mockUseAuthStatus.mockReturnValue({
      isFullyAuthenticated: false,
      isLoading: false,
      status: 'UNAUTHENTICATED',
      hasKeypair: false,
      hasProfile: false,
    });
    const { container } = render(<Fab />);
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
    const { container } = render(<Fab />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null on onboarding routes even when fully authenticated', () => {
    mockUsePathname.mockReturnValue('/onboarding/tags');
    const { container } = render(<Fab />);
    expect(container.firstChild).toBeNull();
  });

  it.each(Object.values(LEGAL_ROUTES))('does not cover the legal text on %s', (pathname) => {
    mockUsePathname.mockReturnValue(pathname);
    const { container } = render(<Fab />);
    expect(container.firstChild).toBeNull();
  });

  describe('createPost action', () => {
    it('renders the new post dialog and opens it on click', () => {
      render(<Fab />);
      expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-open', 'false');
      expect(screen.queryByTestId('new-collection-dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('new-post-cta'));

      expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-open', 'true');
    });

    it('forwards onPostCreated to the new post dialog when the action binds it', () => {
      mockUseFabAction.mockReturnValue({
        kind: 'createPost',
        ariaLabel: 'New bookmark',
        onPostCreated: vi.fn(),
      });
      render(<Fab />);
      expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-has-on-post-created', 'true');
    });

    it('does not forward onPostCreated for the default new post action', () => {
      render(<Fab />);
      expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-has-on-post-created', 'false');
    });
  });

  describe('createCollection action', () => {
    it('renders the collection dialog instead of the post dialog', () => {
      mockUseFabAction.mockReturnValue({ kind: 'createCollection', ariaLabel: 'New collection' });
      render(<Fab />);

      expect(screen.getByTestId('new-collection-dialog')).toBeInTheDocument();
      expect(screen.queryByTestId('dialog-new-post')).not.toBeInTheDocument();
      expect(screen.getByTestId('new-post-cta')).toHaveAttribute('aria-label', 'New collection');
    });

    it('opens the collection dialog on click', () => {
      mockUseFabAction.mockReturnValue({ kind: 'createCollection', ariaLabel: 'New collection' });
      render(<Fab />);
      expect(screen.getByTestId('new-collection-dialog')).toHaveAttribute('data-open', 'false');

      fireEvent.click(screen.getByTestId('new-post-cta'));

      expect(screen.getByTestId('new-collection-dialog')).toHaveAttribute('data-open', 'true');
    });
  });

  describe('unauthenticated on public explore route', () => {
    beforeEach(() => {
      mockUseAuthStatus.mockReturnValue({
        isFullyAuthenticated: false,
        isLoading: false,
        status: 'UNAUTHENTICATED',
        hasKeypair: false,
        hasProfile: false,
      });
      mockIsPublicExploreRoute.mockReturnValue(true);
    });

    it('renders only the button without any dialog', () => {
      render(<Fab />);
      expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
      expect(screen.queryByTestId('dialog-new-post')).not.toBeInTheDocument();
      expect(screen.queryByTestId('new-collection-dialog')).not.toBeInTheDocument();
    });

    it('routes the click through requireAuth (sign-in)', () => {
      mockRequireAuth.mockImplementation(() => undefined);
      render(<Fab />);

      fireEvent.click(screen.getByTestId('new-post-cta'));

      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('guest contextual banner', () => {
    const guestAuthStatus = {
      isFullyAuthenticated: false,
      isLoading: false,
      status: 'UNAUTHENTICATED',
      hasKeypair: false,
      hasProfile: false,
    };

    beforeEach(() => {
      useContextualBannerStore.setState({ visible: false });
      mockUsePathname.mockReturnValue(`/post/${PUBKY_52_STAGING_FIXTURE}/${POST_ID_STAGING_FIXTURE}`);
      mockIsPublicExploreRoute.mockReturnValue(true);
    });

    afterEach(() => {
      useContextualBannerStore.setState({ visible: false });
    });

    it('hides the FAB for a guest while the banner is visible', () => {
      mockUseAuthStatus.mockReturnValue(guestAuthStatus);
      useContextualBannerStore.getState().show();

      const { container } = render(<Fab />);

      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('new-post-cta')).not.toBeInTheDocument();
    });

    it('keeps the FAB for a guest while the banner is hidden', () => {
      mockUseAuthStatus.mockReturnValue(guestAuthStatus);

      render(<Fab />);

      expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
    });

    it('keeps the FAB and its dialog for an authenticated user while the banner is visible', () => {
      useContextualBannerStore.getState().show();

      render(<Fab />);

      expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-new-post')).toBeInTheDocument();
    });

    it('follows the banner store for a guest: back when it hides, gone again when it shows', () => {
      mockUseAuthStatus.mockReturnValue(guestAuthStatus);
      useContextualBannerStore.getState().show();
      render(<Fab />);
      expect(screen.queryByTestId('new-post-cta')).not.toBeInTheDocument();

      act(() => useContextualBannerStore.getState().hide());

      expect(screen.getByTestId('new-post-cta')).toBeInTheDocument();

      act(() => useContextualBannerStore.getState().show());

      expect(screen.queryByTestId('new-post-cta')).not.toBeInTheDocument();
    });
  });
});

it.each(['/shop', '/shop/marketplace/cart'])(
  'does not cover embedded Shop with the App post button on %s',
  (pathname) => {
    mockUsePathname.mockReturnValue(pathname);
    mockIsPublicExploreRoute.mockReturnValue(true);
    render(<Fab />);
    expect(screen.queryByTestId('new-post-cta')).not.toBeInTheDocument();
  },
);
