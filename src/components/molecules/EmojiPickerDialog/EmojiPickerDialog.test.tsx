import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmojiPickerDialog } from './EmojiPickerDialog';

// Mock EmojiPicker (emoji-mart) — keep Dialog real per docs/component-testing.md
const mockOnEmojiSelect = vi.fn();
vi.mock('@/molecules/EmojiPicker/EmojiPicker', () => {
  return {
    EmojiPicker: ({
      onEmojiSelect,
      maxLength,
      currentInput,
    }: {
      onEmojiSelect: (emoji: { native: string }) => void;
      maxLength?: number;
      currentInput?: string;
    }) => {
      // Store the callback for testing
      mockOnEmojiSelect.mockImplementation(onEmojiSelect);
      return (
        <div data-testid="emoji-picker">
          <button data-testid="test-emoji-select" onClick={() => onEmojiSelect({ native: '😊' })}>
            Select Emoji
          </button>
          <div data-testid="max-length">{maxLength || 'none'}</div>
          <div data-testid="current-input">{currentInput || 'none'}</div>
        </div>
      );
    },
  };
});

describe('EmojiPickerDialog', () => {
  const mockOnEmojiSelect = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open is true', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
  });

  it('does not render content when open is false', () => {
    render(<EmojiPickerDialog open={false} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
  });

  it('passes maxLength to EmojiPicker', () => {
    render(
      <EmojiPickerDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onEmojiSelect={mockOnEmojiSelect}
        maxLength={12}
      />,
    );

    expect(screen.getByTestId('max-length')).toHaveTextContent('12');
  });

  it('passes currentInput to EmojiPicker', () => {
    render(
      <EmojiPickerDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onEmojiSelect={mockOnEmojiSelect}
        currentInput="Hello"
      />,
    );

    expect(screen.getByTestId('current-input')).toHaveTextContent('Hello');
  });

  it('calls onEmojiSelect and closes dialog when emoji is selected', async () => {
    render(<EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    const selectButton = screen.getByTestId('test-emoji-select');
    selectButton.click();

    await waitFor(() => {
      expect(mockOnEmojiSelect).toHaveBeenCalledWith({ native: '😊' });
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('contains clicks within the dialog so they do not reach a clickable ancestor', () => {
    // Regression: the dialog is portaled, but React events bubble up the React
    // tree — without stopPropagation an emoji click reaches an ancestor (e.g. a
    // collection card's Link) and triggers navigation.
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />
      </div>,
    );

    screen.getByTestId('test-emoji-select').click();

    expect(mockOnEmojiSelect).toHaveBeenCalledWith({ native: '😊' });
    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it('stops wheel propagation so Radix RemoveScroll does not block emoji-mart scrolling', () => {
    // Regression (#1871): without stopPropagation, Radix Dialog RemoveScroll
    // swallows wheel events before emoji-mart's Shadow DOM scroller can use them.
    const ancestorWheel = vi.fn();
    render(
      <div onWheel={ancestorWheel}>
        <EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />
      </div>,
    );

    fireEvent.wheel(screen.getByTestId('dialog-content'));

    expect(ancestorWheel).not.toHaveBeenCalled();
  });

  it('stops touchmove propagation so Radix RemoveScroll does not block emoji-mart scrolling', () => {
    const ancestorTouchMove = vi.fn();
    render(
      <div onTouchMove={ancestorTouchMove}>
        <EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />
      </div>,
    );

    fireEvent.touchMove(screen.getByTestId('dialog-content'));

    expect(ancestorTouchMove).not.toHaveBeenCalled();
  });

  it('renders with correct dialog classes', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).toHaveClass('max-w-sm', 'overflow-hidden', 'p-0', 'sm:p-0');
  });

  it('renders dialog description', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    expect(screen.getByText('Select an emoji')).toBeInTheDocument();
  });
});

describe('EmojiPickerDialog - Snapshots', () => {
  it('matches snapshot when open', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={() => {}} onEmojiSelect={() => {}} />);
    // Portaled content: snapshot the content wrapper (same pattern as Dialog atom tests)
    expect(screen.getByTestId('dialog-content').parentElement).toMatchSnapshot();
  });

  it('matches snapshot with maxLength', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={() => {}} onEmojiSelect={() => {}} maxLength={12} />);
    expect(screen.getByTestId('dialog-content').parentElement).toMatchSnapshot();
  });

  it('matches snapshot with currentInput', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={() => {}} onEmojiSelect={() => {}} currentInput="Hello" />);
    expect(screen.getByTestId('dialog-content').parentElement).toMatchSnapshot();
  });
});
