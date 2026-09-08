import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseTagSuggestionsResult } from '@/hooks/useTagSuggestions/useTagSuggestions.types';
import { TagInput } from './TagInput';

const mockUseTagSuggestions = vi.hoisted(() =>
  vi.fn((): UseTagSuggestionsResult => ({ suggestions: [], isLoading: false })),
);

// Use real hooks, only mock useEmojiInsert and useTagSuggestions
vi.mock('@/hooks/useEmojiInsert/useEmojiInsert', () => ({
  useEmojiInsert: vi.fn(() => vi.fn()),
}));

vi.mock('@/hooks/useTagSuggestions/useTagSuggestions', () => ({
  useTagSuggestions: mockUseTagSuggestions,
}));

vi.mock('@/molecules/EmojiPickerDialog/EmojiPickerDialog', () => {
  return {
    EmojiPickerDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="emoji-picker" /> : null),
  };
});

const mockOnTagAdd = vi.fn();

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

  it('uses dashed container chrome by default', () => {
    const { container } = render(<TagInput onTagAdd={mockOnTagAdd} />);
    const tagInputContainer = container.querySelector('div.relative');

    expect(tagInputContainer).toHaveClass('border-dashed');
    expect(tagInputContainer).toHaveClass('shadow-sm');
    expect(screen.getByLabelText('Open emoji picker')).toHaveClass('shadow-xs-dark');
  });

  it('removes dashed and shadow chrome in plain variant', () => {
    const { container } = render(<TagInput onTagAdd={mockOnTagAdd} containerVariant="plain" />);
    const tagInputContainer = container.querySelector('div.relative');

    expect(tagInputContainer).not.toHaveClass('border-dashed');
    expect(tagInputContainer).not.toHaveClass('shadow-sm');
    expect(screen.getByLabelText('Open emoji picker')).not.toHaveClass('shadow-xs-dark');
  });

  it('suppresses navigation (preventDefault + stopPropagation) on container click, while still calling onClick', () => {
    const mockOnClick = vi.fn();
    const { container } = render(<TagInput onTagAdd={mockOnTagAdd} onClick={mockOnClick} />);
    const tagInputContainer = container.querySelector('div.relative')!;

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
    tagInputContainer.dispatchEvent(clickEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockOnClick).toHaveBeenCalledTimes(1);
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

  it('does not widen the container when max tags are reached', () => {
    const { container } = render(
      <TagInput onTagAdd={mockOnTagAdd} maxTags={5} currentTagsCount={5} className="w-32" />,
    );
    const tagInputContainer = container.querySelector('div.relative');

    expect(tagInputContainer).toHaveClass('w-32');
    expect(tagInputContainer).not.toHaveClass('w-40');
  });

  it('renders the at-limit placeholder at full opacity', () => {
    render(<TagInput onTagAdd={mockOnTagAdd} maxTags={5} currentTagsCount={5} limitReachedPlaceholder="5 tags max" />);

    const input = screen.getByPlaceholderText('5 tags max');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('placeholder:text-destructive', 'disabled:opacity-100');
  });

  it('clears an in-progress value when another selection reaches the cap', async () => {
    const { rerender } = render(
      <TagInput
        onTagAdd={mockOnTagAdd}
        maxTags={5}
        currentTagsCount={4}
        limitReachedPlaceholder="5 tags max"
        clearOnLimitReached
      />,
    );
    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'unfinished' } });
    expect(input).toHaveValue('unfinished');

    rerender(
      <TagInput
        onTagAdd={mockOnTagAdd}
        maxTags={5}
        currentTagsCount={5}
        limitReachedPlaceholder="5 tags max"
        clearOnLimitReached
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('5 tags max')).toHaveValue('');
    });
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

  it('matches snapshot in plain variant', () => {
    const { container } = render(<TagInput onTagAdd={mockOnTagAdd} containerVariant="plain" />);
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

  it('passes selected viewer tags through the API exclusion contract', async () => {
    render(
      <TagInput
        onTagAdd={mockOnTagAdd}
        viewerTags={[{ label: 'bitcoin' }]}
        enableApiSuggestions
        excludeFromApiSuggestions={['bitcoin']}
      />,
    );

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });

    await waitFor(() => {
      expect(mockUseTagSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeTags: ['bitcoin'],
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

  it('selects API suggestion with keyboard and adds it', async () => {
    mockUseTagSuggestions.mockReturnValue({
      suggestions: ['bitcoin', 'bitconnect'],
      isLoading: false,
    });

    render(<TagInput onTagAdd={mockOnTagAdd} enableApiSuggestions={true} addOnSuggestionClick={true} />);

    const input = screen.getByPlaceholderText('add tag') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bit' } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('bitcoin')).toBeInTheDocument();
      expect(screen.getByText('bitconnect')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnTagAdd).toHaveBeenCalledWith('bitcoin');
    expect(input.value).toBe('');
  });

  it('submits typed tag on Enter when no suggestion is selected', async () => {
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

    fireEvent.keyDown(input, { key: 'Enter' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockOnTagAdd).toHaveBeenCalledWith('bit');
  });
});
