import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { ProfileMenuActions } from './ProfileMenuActions';

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
      <button onClick={onActionComplete}>Complete action</button>
    </div>
  ),
}));

describe('ProfileMenuActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('renders the trigger with the dropdown closed on desktop', () => {
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-menu-actions-content')).not.toBeInTheDocument();
  });

  it('opens the dropdown through requireAuth when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const content = screen.getByTestId('profile-menu-actions-content');
    expect(content).toHaveAttribute('data-user-id', 'pk:test123');
    expect(content).toHaveAttribute('data-variant', 'dropdown');
  });

  it('does not open the dropdown when requireAuth withholds the action', async () => {
    mockRequireAuth.mockImplementationOnce(() => undefined);
    const user = userEvent.setup();
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the dropdown when an action completes', async () => {
    const user = userEvent.setup();
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Complete action' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});

describe('ProfileMenuActions - mobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('renders the trigger with the sheet closed', () => {
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a bottom sheet through requireAuth when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    const dialog = await screen.findByRole('dialog', { name: 'Profile Actions' });
    expect(dialog).toHaveClass('inset-x-0', 'bottom-0');
    const content = screen.getByTestId('profile-menu-actions-content');
    expect(content).toHaveAttribute('data-user-id', 'pk:test123');
    expect(content).toHaveAttribute('data-variant', 'sheet');
  });

  it('closes the sheet when an action completes', async () => {
    const user = userEvent.setup();
    render(<ProfileMenuActions userId="pk:test123" trigger={<button>Menu</button>} />);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Complete action' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
