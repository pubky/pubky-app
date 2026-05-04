import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EmojiPickerDialog } from './EmojiPickerDialog';
vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div data-testid="dialog" data-open={open}>
        {open && children}
      </div>
    ),
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-content" className={className}>
        {children}
      </div>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p data-testid="dialog-description">{children}</p>
    ),
  };
});

// Mock EmojiPicker
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

// Mock Dialog components
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
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

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<EmojiPickerDialog open={false} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
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

  it('renders with correct dialog classes', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    const dialogContent = screen.getByTestId('dialog-content');
    expect(dialogContent).toHaveClass('max-w-sm', 'overflow-hidden', 'p-0', 'sm:p-0');
  });

  it('renders dialog description', () => {
    render(<EmojiPickerDialog open={true} onOpenChange={mockOnOpenChange} onEmojiSelect={mockOnEmojiSelect} />);

    expect(screen.getByTestId('dialog-description')).toHaveTextContent('Select an emoji');
  });
});

describe('EmojiPickerDialog - Snapshots', () => {
  it('matches snapshot when open', () => {
    const { container } = render(<EmojiPickerDialog open={true} onOpenChange={() => {}} onEmojiSelect={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<EmojiPickerDialog open={false} onOpenChange={() => {}} onEmojiSelect={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with maxLength', () => {
    const { container } = render(
      <EmojiPickerDialog open={true} onOpenChange={() => {}} onEmojiSelect={() => {}} maxLength={12} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with currentInput', () => {
    const { container } = render(
      <EmojiPickerDialog open={true} onOpenChange={() => {}} onEmojiSelect={() => {}} currentInput="Hello" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
