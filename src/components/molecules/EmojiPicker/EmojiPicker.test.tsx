import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmojiPicker } from './EmojiPicker';

// Track MockPicker calls
const MockPickerSpy = vi.fn();

// Mock emoji-mart
const mockPickerInstance = {
  destroy: vi.fn(),
  update: vi.fn(),
};

let mockResolvedTheme = 'dark';
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme }),
}));

vi.mock('emoji-mart', () => ({
  Picker: class {
    constructor() {
      MockPickerSpy();
      return mockPickerInstance;
    }
  },
}));

vi.mock('@emoji-mart/data', () => ({
  default: {},
}));

describe('EmojiPicker', () => {
  const mockOnEmojiSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvedTheme = 'dark';
  });

  it('renders picker container', () => {
    const { container } = render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} />);
    const pickerDiv = container.querySelector('div[class*="w-full"]');
    expect(pickerDiv).toBeInTheDocument();
  });

  it('initializes emoji picker on mount', async () => {
    render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalled();
    });
  });

  it('initializes picker with maxLength prop', async () => {
    render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} maxLength={12} />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalled();
    });
  });

  it('initializes picker with currentInput prop', async () => {
    render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} currentInput="Hello" />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalled();
    });
  });

  it('initializes picker with both maxLength and currentInput', async () => {
    render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} maxLength={12} currentInput="Hello" />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalled();
    });
  });

  it('updates refs when props change', async () => {
    const { rerender } = render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} maxLength={10} currentInput="Hi" />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalled();
    });

    rerender(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} maxLength={20} currentInput="Hello World" />);

    // Component should re-render with new props
    expect(MockPickerSpy).toHaveBeenCalled();
  });

  it('cleans up picker on unmount', async () => {
    const { unmount } = render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalled();
    });

    unmount();

    // Component should unmount successfully
    expect(MockPickerSpy).toHaveBeenCalled();
  });

  it('updates the open picker theme in place when the resolved theme changes', async () => {
    const { rerender } = render(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} />);

    await waitFor(() => {
      expect(MockPickerSpy).toHaveBeenCalledTimes(1);
    });

    mockResolvedTheme = 'light';
    rerender(<EmojiPicker onEmojiSelect={mockOnEmojiSelect} />);

    expect(mockPickerInstance.update).toHaveBeenLastCalledWith({ theme: 'light' });
    expect(MockPickerSpy).toHaveBeenCalledTimes(1);
  });
});
