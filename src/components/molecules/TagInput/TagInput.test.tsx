import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TagInput } from './TagInput';

// Hoist mock for useTagSuggestions
const { mockUseTagSuggestions } = vi.hoisted(() => ({
  mockUseTagSuggestions: vi.fn(() => ({ suggestions: [], isLoading: false })),
}));

// Use real hooks, only mock useEmojiInsert and useTagSuggestions
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useEmojiInsert: vi.fn(() => vi.fn()),
    useTagSuggestions: (...args: unknown[]) => mockUseTagSuggestions(...args),
  };
});

vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    EmojiPickerDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="emoji-picker" /> : null),
  };
});

const mockOnTagAdd = vi.fn<(tag: string) => void>();

describe('TagInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input with placeholder', () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    expect(screen.getByPlaceholderText('add tag')).toBeInTheDocument();
  });

  it('renders emoji picker button', () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    expect(screen.getByLabelText('Open emoji picker')).toBeInTheDocument();
  });

  it('calls onTagAdd when Enter is pressed with valid tag', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bitcoin' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockOnTagAdd).toHaveBeenCalledWith('bitcoin');
  });

  it('converts uppercase input to lowercase', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'BITCOIN' } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('bitcoin');

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockOnTagAdd).toHaveBeenCalledWith('bitcoin');
  });
});

describe('TagInput - Banned Character Sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips colons from typed input', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello:world' } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('helloworld');
  });

  it('strips commas from typed input', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello,world' } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('helloworld');
  });

  it('strips spaces from typed input', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello world' } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('helloworld');
  });

  it('strips multiple banned characters from typed input', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello: world, test' } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('helloworldtest');
  });

  it('submits sanitized tag without banned characters', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} />);
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit:coin' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockOnTagAdd).toHaveBeenCalledWith('bitcoin');
  });
});

describe('TagInput - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot', () => {
    const { container } = render(<TagInput onTagAdd={mockOnTagAdd} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TagInput - API Suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTagSuggestions.mockReturnValue({ suggestions: [], isLoading: false });
  });

  it('passes correct params to useTagSuggestions when enabled', async () => {
    render(
      <TagInput onTagAdd={mockOnTagAdd} enableApiSuggestions={true} excludeFromApiSuggestions={['existing-tag']} />,
    );

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });

    await waitFor(() => {
      expect(mockUseTagSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'bit',
          excludeTags: expect.arrayContaining(['existing-tag']),
          enabled: true,
        }),
      );
    });
  });

  it('disables useTagSuggestions when enableApiSuggestions is false', async () => {
    render(<TagInput onTagAdd={mockOnTagAdd} enableApiSuggestions={false} />);

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });

    await waitFor(() => {
      expect(mockUseTagSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });
  });

  it('shows API suggestions in dropdown when available', async () => {
    mockUseTagSuggestions.mockReturnValue({
      suggestions: ['bitcoin', 'bitconnect'],
      isLoading: false,
    });

    render(<TagInput onTagAdd={mockOnTagAdd} enableApiSuggestions={true} />);

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('bitcoin')).toBeInTheDocument();
      expect(screen.getByText('bitconnect')).toBeInTheDocument();
    });
  });

  it('merges local and API suggestions without duplicates', async () => {
    mockUseTagSuggestions.mockReturnValue({
      suggestions: ['bitcoin', 'api-only'],
      isLoading: false,
    });

    render(
      <TagInput
        onTagAdd={mockOnTagAdd}
        enableApiSuggestions={true}
        existingTags={[{ label: 'bitcoin' }, { label: 'local-only' }]}
      />,
    );

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });
    fireEvent.focus(input);

    await waitFor(() => {
      // bitcoin should appear only once (from local, which takes priority)
      const bitcoinElements = screen.getAllByText('bitcoin');
      expect(bitcoinElements).toHaveLength(1);

      // api-only should appear since it's not in local
      expect(screen.getByText('api-only')).toBeInTheDocument();
    });
  });

  it('clicking API suggestion directly adds the tag', async () => {
    mockUseTagSuggestions.mockReturnValue({
      suggestions: ['bitcoin'],
      isLoading: false,
    });

    render(<TagInput onTagAdd={mockOnTagAdd} enableApiSuggestions={true} addOnSuggestionClick={true} />);

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('bitcoin')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('bitcoin'));

    // Should directly call onTagAdd with the suggestion
    expect(mockOnTagAdd).toHaveBeenCalledWith('bitcoin');
    // Input should be cleared
    expect(input.value).toBe('');
  });
});
