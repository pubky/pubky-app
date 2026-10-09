import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS_LABELS } from '@/libs/status/status.constants';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { StatusPickerWrapper } from './StatusPickerWrapper';

beforeEach(() => {
  useAuthStore.setState({
    currentUserPubky: 'account',
    session: mockSession(),
    restoreStatus: 'ready',
    showSignInDialog: false,
  });
});

// Mock StatusPickerContent
vi.mock('../StatusPickerContent/StatusPickerContent', () => ({
  StatusPickerContent: ({
    onStatusSelect,
    currentStatus,
  }: {
    onStatusSelect: (status: string) => void;
    currentStatus?: string;
  }) => (
    <div data-testid="status-picker-content">
      <button data-testid="select-status-available" onClick={() => onStatusSelect('available')}>
        Available
      </button>
      <button data-testid="select-status-away" onClick={() => onStatusSelect('away')}>
        Away
      </button>
      <div data-testid="current-status">{currentStatus || 'none'}</div>
    </div>
  ),
}));

// Mock useIsMobile hook
vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => false,
}));

describe('StatusPickerWrapper', () => {
  const mockOnStatusChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders emoji and status correctly for predefined status', () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);

      expect(screen.getByText('🌴')).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.vacationing)).toBeInTheDocument();
    });

    it('renders emoji and status correctly for custom status', () => {
      render(<StatusPickerWrapper emoji="😊" status="😊Working hard" />);

      expect(screen.getByText('😊')).toBeInTheDocument();
      expect(screen.getByText('Working hard')).toBeInTheDocument();
    });

    it('renders chevron icon', () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);

      const chevron = screen.getByText('🌴').closest('button')?.querySelector('svg');
      expect(chevron).toBeInTheDocument();
    });
  });

  describe('Status Selection', () => {
    it('requests sign-in before opening a picker for a retained recovery identity', () => {
      useAuthStore.setState({ session: null, restoreStatus: 'reauth-required' });
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByTestId('status-picker-content')).not.toBeInTheDocument();
      expect(useAuthStore.getState().showSignInDialog).toBe(true);
      expect(mockOnStatusChange).not.toHaveBeenCalled();
    });

    it('does not change the displayed status when the session is lost after opening', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />);
      fireEvent.click(screen.getByRole('button'));
      const choice = await screen.findByTestId('select-status-available');
      useAuthStore.setState({ session: null, restoreStatus: 'reauth-required' });
      fireEvent.click(choice);
      expect(mockOnStatusChange).not.toHaveBeenCalled();
      expect(screen.getByText(STATUS_LABELS.vacationing)).toBeInTheDocument();
      expect(useAuthStore.getState().showSignInDialog).toBe(true);
    });
    it('calls onStatusChange when status is selected', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });

      const availableButton = screen.getByTestId('select-status-available');
      fireEvent.click(availableButton);

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalledWith('available');
      });
    });

    it('closes popover after status selection', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });

      const availableButton = screen.getByTestId('select-status-available');
      fireEvent.click(availableButton);

      await waitFor(() => {
        expect(screen.queryByTestId('status-picker-content')).not.toBeInTheDocument();
      });
    });

    it('updates local status when status is selected', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });

      const availableButton = screen.getByTestId('select-status-available');
      fireEvent.click(availableButton);

      // Re-open to check current status
      await waitFor(() => {
        expect(screen.queryByTestId('status-picker-content')).not.toBeInTheDocument();
      });

      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('current-status')).toHaveTextContent('available');
      });
    });
  });

  describe('Popover Behavior', () => {
    it('opens popover when trigger is clicked', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });
    });

    it('passes current status to StatusPickerContent', async () => {
      render(<StatusPickerWrapper emoji="👋" status="available" />);

      const triggerButton = screen.getByText('👋').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('current-status')).toHaveTextContent('available');
      });
    });

    it('rotates chevron when popover is open', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);

      const triggerButton = screen.getByText('🌴').closest('button');
      const chevron = triggerButton?.querySelector('svg');

      expect(chevron).not.toHaveClass('rotate-180');

      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(chevron).toHaveClass('rotate-180');
      });
    });
  });

  describe('Mobile Behavior', () => {
    it('uses Sheet component on mobile', async () => {
      // Mock useIsMobile to return true
      vi.doMock('@/hooks/useIsMobile/useIsMobile', () => ({
        useIsMobile: () => true,
      }));

      // Re-import to get the mocked version
      const { StatusPickerWrapper: MobileStatusPicker } = await import('./StatusPickerWrapper');

      render(<MobileStatusPicker emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      // On mobile, it should use Sheet instead of Popover
      // The exact implementation depends on how Sheet renders
      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });
    });
  });

  describe('Custom Configuration', () => {
    it('uses default sideOffset when not provided', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });
    });

    it('uses custom sideOffset when provided', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" sideOffset={-50} />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });
    });

    it('accepts zero as sideOffset', async () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" sideOffset={0} />);

      const triggerButton = screen.getByText('🌴').closest('button');
      fireEvent.click(triggerButton!);

      await waitFor(() => {
        expect(screen.getByTestId('status-picker-content')).toBeInTheDocument();
      });
    });
  });

  describe('StatusPickerWrapper - Snapshots', () => {
    it('matches snapshot with predefined status', () => {
      const { container } = render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom status', () => {
      const { container } = render(<StatusPickerWrapper emoji="😊" status="😊Working" />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with onStatusChange handler', () => {
      const { container } = render(
        <StatusPickerWrapper emoji="🌴" status="vacationing" onStatusChange={mockOnStatusChange} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom sideOffset', () => {
      const { container } = render(<StatusPickerWrapper emoji="🌴" status="vacationing" sideOffset={-50} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
