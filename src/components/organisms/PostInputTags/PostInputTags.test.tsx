import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostInputTags } from './PostInputTags';
import { POST_MAX_TAGS, TAG_MAX_LENGTH } from '@/config/posts';

// Mock state for TagInput simulation
let mockTagInputValue = '';
let mockShowEmojiPicker = false;

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: vi.fn(
      ({
        children,
        as,
        size,
        className,
      }: {
        children: React.ReactNode;
        as?: React.ElementType;
        size?: string;
        className?: string;
      }) => (
        <span data-testid="typography" data-as={as} data-size={size} className={className}>
          {children}
        </span>
      ),
    ),
  };
});

vi.mock('@/molecules/PostTagAddButton/PostTagAddButton', () => {
  return {
    PostTagAddButton: vi.fn(
      ({ onClick, disabled, variant }: { onClick: () => void; disabled?: boolean; variant?: string }) => (
        <button data-testid="add-tag-button" data-variant={variant} onClick={onClick} disabled={disabled}>
          +
        </button>
      ),
    ),
  };
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  return {
    TagInput: vi.fn(
      ({
        onTagAdd,
        placeholder,
        existingTags = [],
        showCloseButton,
        onClose,
        disabled,
        maxTags,
        currentTagsCount,
        onBlur,
        containerVariant,
      }: {
        onTagAdd: (tag: string) => void;
        placeholder?: string;
        existingTags?: Array<{ label: string }>;
        showCloseButton?: boolean;
        onClose?: () => void;
        disabled?: boolean;
        maxTags?: number;
        currentTagsCount?: number;
        limitReachedPlaceholder?: string;
        onBlur?: () => void;
        containerVariant?: string;
      }) => {
        const isAtLimit = maxTags !== undefined && (currentTagsCount ?? 0) >= maxTags;
        return (
          <div data-testid="tag-input-wrapper" data-container-variant={containerVariant}>
            <input
              data-testid="tag-input"
              value={mockTagInputValue}
              placeholder={isAtLimit ? 'limit reached' : placeholder}
              disabled={disabled || isAtLimit}
              onChange={(e) => {
                mockTagInputValue = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mockTagInputValue.trim()) {
                  e.preventDefault();
                  const trimmedValue = mockTagInputValue.trim();
                  // Check for duplicates (case-insensitive) - simulating useTagInput behavior
                  const isDuplicate = existingTags.some(
                    (tag) => tag.label.toLowerCase() === trimmedValue.toLowerCase(),
                  );
                  if (!isDuplicate) {
                    onTagAdd(trimmedValue);
                  }
                  mockTagInputValue = '';
                }
              }}
              onBlur={() => {
                if (!mockTagInputValue && onBlur) {
                  onBlur();
                }
              }}
            />
            <button
              data-testid="emoji-button"
              aria-label="Open emoji picker"
              onClick={() => {
                mockShowEmojiPicker = true;
              }}
              disabled={disabled || isAtLimit}
            >
              😀
            </button>
            {showCloseButton && (
              <button data-testid="close-button" aria-label="Close tag input" onClick={onClose}>
                ×
              </button>
            )}
            {mockShowEmojiPicker && (
              <div data-testid="emoji-picker-dialog">
                <button
                  data-testid="emoji-select"
                  onClick={() => {
                    mockTagInputValue += '😀';
                  }}
                >
                  Select Emoji
                </button>
              </div>
            )}
          </div>
        );
      },
    ),
  };
});

vi.mock('@/molecules/TagInputToggle/TagInputToggle', () => {
  return {
    TagInputToggle: ({
      showInput,
      inputContent,
      addButtonContent,
    }: {
      showInput: boolean;
      inputContent: React.ReactNode;
      addButtonContent: React.ReactNode;
    }) => <div data-testid="tag-input-toggle">{showInput ? inputContent : addButtonContent}</div>,
  };
});

describe('PostInputTags', () => {
  const mockOnTagsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTagInputValue = '';
    mockShowEmojiPicker = false;
  });

  it('renders with empty tags array', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    expect(screen.getAllByTestId('container').length).toBeGreaterThan(0);
    expect(screen.getByTestId('add-tag-button')).toBeInTheDocument();
  });

  it('shows TagInput when add button is clicked', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    expect(screen.getByTestId('tag-input-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('tag-input')).toBeInTheDocument();
  });

  it('adds tag when Enter is pressed in input', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    const input = screen.getByTestId('tag-input');
    fireEvent.change(input, { target: { value: 'new-tag' } });
    mockTagInputValue = 'new-tag';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockOnTagsChange).toHaveBeenCalledWith(['new-tag']);
  });

  it('does not add duplicate tags', () => {
    render(<PostInputTags tags={['existing-tag']} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    const input = screen.getByTestId('tag-input');
    fireEvent.change(input, { target: { value: 'existing-tag' } });
    mockTagInputValue = 'existing-tag';
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should not call onTagsChange for duplicates
    expect(mockOnTagsChange).not.toHaveBeenCalled();
  });

  it('closes input when close button is clicked', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    expect(screen.getByTestId('tag-input-wrapper')).toBeInTheDocument();
    const closeButton = screen.getByTestId('close-button');
    fireEvent.click(closeButton);
    expect(screen.queryByTestId('tag-input-wrapper')).not.toBeInTheDocument();
  });

  it('renders emoji button in TagInput', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    const emojiButton = screen.getByTestId('emoji-button');
    expect(emojiButton).toBeInTheDocument();
    expect(emojiButton).toHaveAttribute('aria-label', 'Open emoji picker');
  });

  it('disables add button when POST_MAX_TAGS limit is reached', () => {
    const maxTags = Array.from({ length: POST_MAX_TAGS }, (_, i) => `tag${i + 1}`);
    render(<PostInputTags tags={maxTags} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    expect(addButton).toBeDisabled();
  });

  it('uses custom maxTags when provided', () => {
    const customMax = 3;
    const tags = ['tag1', 'tag2', 'tag3'];
    render(<PostInputTags tags={tags} onTagsChange={mockOnTagsChange} maxTags={customMax} />);
    const addButton = screen.getByTestId('add-tag-button');
    expect(addButton).toBeDisabled();
  });

  it('handles large number of tags (2100)', () => {
    const largeTagCount = 2100;
    const largeTags = Array.from({ length: largeTagCount }, (_, i) => `tag${i + 1}`);
    render(<PostInputTags tags={largeTags} onTagsChange={mockOnTagsChange} maxTags={largeTagCount} />);
    const addButton = screen.getByTestId('add-tag-button');
    expect(addButton).toBeDisabled();
  });

  it('disables input when disabled prop is true', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} disabled={true} />);
    const addButton = screen.getByTestId('add-tag-button');
    expect(addButton).toBeDisabled();
  });

  it('uses plain variants for both states', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);

    expect(screen.getByTestId('add-tag-button')).toHaveAttribute('data-variant', 'plain');

    fireEvent.click(screen.getByTestId('add-tag-button'));
    expect(screen.getByTestId('tag-input-wrapper')).toHaveAttribute('data-container-variant', 'plain');
  });

  // todo: enable once tag input has max length implemented, see https://github.com/pubky/franky/issues/519
  it.skip('enforces 20 character max length for tag input field', () => {
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    const input = screen.getByTestId('tag-input');
    expect(input).toHaveAttribute('maxLength', String(TAG_MAX_LENGTH));
  });

  // todo: enable once tag input has max length implemented, see https://github.com/pubky/franky/issues/519
  it.skip('prevents entering tags longer than 20 characters', () => {
    const longTag = 'a'.repeat(21);
    render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: longTag } });
    // Input should be limited to 20 characters by maxLength attribute
    expect(input.value.length).toBeLessThanOrEqual(TAG_MAX_LENGTH);
    // Verify the actual value is truncated
    expect(mockTagInputValue.length).toBeLessThanOrEqual(TAG_MAX_LENGTH);
  });
});

describe('PostInputTags - Snapshots', () => {
  const mockOnTagsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTagInputValue = '';
    mockShowEmojiPicker = false;
  });

  it('matches snapshot with empty tags', () => {
    const { container } = render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with tags', () => {
    const { container } = render(<PostInputTags tags={['tag1', 'tag2']} onTagsChange={mockOnTagsChange} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with input open', () => {
    const { container } = render(<PostInputTags tags={[]} onTagsChange={mockOnTagsChange} />);
    const addButton = screen.getByTestId('add-tag-button');
    fireEvent.click(addButton);
    expect(container.firstChild).toMatchSnapshot();
  });
});
