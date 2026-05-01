import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusPickerContent } from './StatusPickerContent';
import { STATUS_EMOJIS, STATUS_LABELS } from '@/libs/status/status.constants';

// Mock EmojiPickerDialog
vi.mock('@/molecules/EmojiPickerDialog/EmojiPickerDialog', () => {
  return {
    EmojiPickerDialog: ({
      open,
      onOpenChange,
      onEmojiSelect,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onEmojiSelect: (emoji: { native: string }) => void;
    }) => {
      if (!open) return null;
      return (
        <div data-testid="emoji-picker-dialog">
          <button data-testid="emoji-select-button" onClick={() => onEmojiSelect({ native: '😊' })}>
            Select Emoji
          </button>
          <button data-testid="emoji-close-button" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      );
    },
  };
});

describe('StatusPickerContent', () => {
  const mockOnStatusSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all predefined status options', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      expect(screen.getByText(STATUS_LABELS.available)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.away)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.vacationing)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.working)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.traveling)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.celebrating)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.sick)).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS.noStatus)).toBeInTheDocument();
    });

    it('renders emojis for predefined statuses', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      expect(screen.getByText(STATUS_EMOJIS.available)).toBeInTheDocument();
      expect(screen.getByText(STATUS_EMOJIS.away)).toBeInTheDocument();
      expect(screen.getByText(STATUS_EMOJIS.vacationing)).toBeInTheDocument();
    });

    it('renders custom status section', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      expect(screen.getByText('Custom Status')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Add status')).toBeInTheDocument();
      expect(screen.getByLabelText('Open emoji picker')).toBeInTheDocument();
    });

    it('shows checkmark for selected predefined status', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="available" />);

      const availableButton = screen.getByText(STATUS_LABELS.available).closest('button');
      expect(availableButton).toBeInTheDocument();
      // Check icon should be present (lucide-react Check icon)
      const checkIcon = availableButton?.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();
    });

    it('does not show checkmark for non-selected statuses', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="available" />);

      const awayButton = screen.getByText(STATUS_LABELS.away).closest('button');
      const checkIcon = awayButton?.querySelector('svg');
      // Should not have check icon
      expect(checkIcon).not.toBeInTheDocument();
    });
  });

  describe('Predefined Status Selection', () => {
    it('calls onStatusSelect when a predefined status is clicked', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const availableButton = screen.getByText(STATUS_LABELS.available).closest('button');
      fireEvent.click(availableButton!);

      expect(mockOnStatusSelect).toHaveBeenCalledTimes(1);
      expect(mockOnStatusSelect).toHaveBeenCalledWith('available');
    });

    it('clears custom status when predefined status is selected', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const input = screen.getByPlaceholderText('Add status');
      fireEvent.change(input, { target: { value: 'Custom text' } });

      const availableButton = screen.getByText(STATUS_LABELS.available).closest('button');
      fireEvent.click(availableButton!);

      expect(input).toHaveValue('');
    });
  });

  describe('Custom Status Input', () => {
    it('allows typing in custom status input', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const input = screen.getByPlaceholderText('Add status') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Working hard' } });

      expect(input.value).toBe('Working hard');
    });

    it('respects maxLength of 50 characters', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const input = screen.getByPlaceholderText('Add status') as HTMLInputElement;
      expect(input).toHaveAttribute('maxLength', '50');
    });

    it('shows emoji button when emoji is selected', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('😊')).toBeInTheDocument();
        expect(screen.getByLabelText('Change emoji')).toBeInTheDocument();
      });
    });

    it('shows smile icon button when no emoji is selected', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      expect(screen.getByLabelText('Open emoji picker')).toBeInTheDocument();
      // Smile icon should be present
      const smileIcon = screen.getByLabelText('Open emoji picker').querySelector('svg');
      expect(smileIcon).toBeInTheDocument();
    });
  });

  describe('Emoji Picker', () => {
    it('opens emoji picker when smile button is clicked', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
      });
    });

    it('closes emoji picker when emoji is selected', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.queryByTestId('emoji-picker-dialog')).not.toBeInTheDocument();
      });
    });

    it('updates selected emoji when emoji is picked', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('😊')).toBeInTheDocument();
      });
    });

    it('opens emoji picker when emoji button is clicked', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      // First select an emoji
      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByLabelText('Change emoji')).toBeInTheDocument();
      });

      // Then click the emoji button to change it
      const emojiButton = screen.getByLabelText('Change emoji');
      fireEvent.click(emojiButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
      });
    });
  });

  describe('Enter Key Submission', () => {
    it('submits custom status when Enter is pressed with valid input', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const input = screen.getByPlaceholderText('Add status');

      // Select an emoji first
      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-select-button')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('😊')).toBeInTheDocument();
      });

      // Type custom status
      fireEvent.change(input, { target: { value: 'Working' } });

      // Press Enter
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockOnStatusSelect).toHaveBeenCalledWith('😊Working');
      });
    });

    it('submits when Enter is pressed without emoji (text-only status)', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const input = screen.getByPlaceholderText('Add status');
      fireEvent.change(input, { target: { value: 'Working' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      expect(mockOnStatusSelect).toHaveBeenCalledWith('Working');
    });

    it('does not submit when Enter is pressed without text', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      // Select an emoji
      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-select-button')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      const input = screen.getByPlaceholderText('Add status');
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      expect(mockOnStatusSelect).not.toHaveBeenCalled();
    });

    it('clears input after successful submission', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const input = screen.getByPlaceholderText('Add status') as HTMLInputElement;

      // Select emoji
      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-select-button')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('😊')).toBeInTheDocument();
      });

      // Type and submit
      fireEvent.change(input, { target: { value: 'Working' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });

  describe('Current Status Handling', () => {
    it('initializes with predefined status when currentStatus is provided', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="available" />);

      const availableButton = screen.getByText(STATUS_LABELS.available).closest('button');
      const checkIcon = availableButton?.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();
    });

    it('initializes custom status fields when currentStatus is custom', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="😊Working hard" />);

      const input = screen.getByPlaceholderText('Add status') as HTMLInputElement;
      expect(input.value).toBe('Working hard');
      expect(screen.getByText('😊')).toBeInTheDocument();
    });

    it('updates when currentStatus changes', () => {
      const { rerender } = render(
        <StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="available" />,
      );

      let availableButton = screen.getByText(STATUS_LABELS.available).closest('button');
      let checkIcon = availableButton?.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();

      rerender(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="away" />);

      const awayButton = screen.getByText(STATUS_LABELS.away).closest('button');
      checkIcon = awayButton?.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();
    });

    it('clears custom status when switching to predefined status', () => {
      const { rerender } = render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="😊Custom" />);

      const input = screen.getByPlaceholderText('Add status') as HTMLInputElement;
      expect(input.value).toBe('Custom');

      rerender(<StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="available" />);

      expect(input.value).toBe('');
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-labels for emoji buttons', () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      expect(screen.getByLabelText('Open emoji picker')).toBeInTheDocument();
    });

    it('has proper aria-label for change emoji button when emoji is selected', async () => {
      render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);

      const smileButton = screen.getByLabelText('Open emoji picker');
      fireEvent.click(smileButton);

      await waitFor(() => {
        expect(screen.getByTestId('emoji-select-button')).toBeInTheDocument();
      });

      const selectButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByLabelText('Change emoji')).toBeInTheDocument();
      });
    });
  });

  describe('Snapshots', () => {
    it('matches snapshot with no current status', () => {
      const { container } = render(<StatusPickerContent onStatusSelect={mockOnStatusSelect} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with predefined status selected', () => {
      const { container } = render(
        <StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="available" />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with custom status', () => {
      const { container } = render(
        <StatusPickerContent onStatusSelect={mockOnStatusSelect} currentStatus="😊Working" />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
