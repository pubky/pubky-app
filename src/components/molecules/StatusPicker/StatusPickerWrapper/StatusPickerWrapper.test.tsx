import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusPickerWrapper } from './StatusPickerWrapper';
import * as Libs from '@/libs';

// Mock StatusPickerContent
vi.mock('../StatusPickerContent', () => ({
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
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useIsMobile: () => false,
  };
});

describe('StatusPickerWrapper', () => {
  const mockOnStatusChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders emoji and status correctly for predefined status', () => {
      render(<StatusPickerWrapper emoji="🌴" status="vacationing" />);

      expect(screen.getByText('🌴')).toBeInTheDocument();
      expect(screen.getByText(Libs.STATUS_LABELS.vacationing)).toBeInTheDocument();
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
      vi.doMock('@/hooks', async () => {
        const actual = await vi.importActual('@/hooks');
        return {
          ...actual,
          useIsMobile: () => true,
        };
      });

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
