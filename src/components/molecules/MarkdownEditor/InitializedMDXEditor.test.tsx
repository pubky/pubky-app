import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { createRef } from 'react';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import InitializedMDXEditor from './InitializedMDXEditor';

// Mock config - use a smaller value for easier testing
const MOCK_MAX_LENGTH = 1000;
vi.mock('@/config', () => ({
  ARTICLE_MAX_CHARACTER_LENGTH: 1000,
}));

// Store toolbar contents renderer to invoke it during tests
let toolbarContentsRenderer: (() => React.ReactNode) | null = null;
// Store onChange handler to invoke it during tests
let capturedOnChange: ((markdown: string, initialMarkdownNormalize?: boolean) => void) | null = null;

// Mock @mdxeditor/editor
vi.mock('@mdxeditor/editor', () => {
  const MockMDXEditor = vi.fn(
    ({
      placeholder,
      className,
      contentEditableClassName,
      plugins,
      onChange,
      readOnly,
      ref: _ref,
      ...props
    }: Record<string, unknown>) => {
      // Capture onChange handler for testing
      capturedOnChange = onChange as typeof capturedOnChange;

      // Find and render toolbar contents if available
      const toolbarContent = toolbarContentsRenderer ? toolbarContentsRenderer() : null;

      return (
        <div
          data-testid="mdx-editor"
          data-placeholder={placeholder}
          className={className}
          data-content-editable-class={contentEditableClassName}
          data-plugins-count={plugins?.length}
          data-readonly={readOnly}
          {...props}
        >
          {toolbarContent && <div data-testid="toolbar">{toolbarContent}</div>}
          <div data-testid="editor-content">Editor Content</div>
        </div>
      );
    },
  );

  return {
    MDXEditor: MockMDXEditor,
    toolbarPlugin: vi.fn((config: { toolbarContents: () => React.ReactNode }) => {
      toolbarContentsRenderer = config.toolbarContents;
      return { type: 'toolbar' };
    }),
    headingsPlugin: vi.fn(() => ({ type: 'headings' })),
    quotePlugin: vi.fn(() => ({ type: 'quote' })),
    listsPlugin: vi.fn(() => ({ type: 'lists' })),
    thematicBreakPlugin: vi.fn(() => ({ type: 'thematicBreak' })),
    linkPlugin: vi.fn(() => ({ type: 'link' })),
    codeBlockPlugin: vi.fn(() => ({ type: 'codeBlock' })),
    codeMirrorPlugin: vi.fn(() => ({ type: 'codeMirror' })),
    maxLengthPlugin: vi.fn(() => ({ type: 'maxLength' })),
    BlockTypeSelect: () => <button data-testid="block-type-select">Block Type</button>,
    BoldItalicUnderlineToggles: () => <button data-testid="bold-italic-toggles">Bold/Italic</button>,
    ButtonWithTooltip: ({
      children,
      title,
      onClick,
    }: {
      children: React.ReactNode;
      title: string;
      onClick: () => void;
    }) => (
      <button data-testid={`button-with-tooltip-${title.toLowerCase()}`} title={title} onClick={onClick}>
        {children}
      </button>
    ),
    CodeToggle: () => <button data-testid="code-toggle">Code</button>,
    InsertCodeBlock: () => <button data-testid="insert-code-block">Insert Code Block</button>,
    InsertThematicBreak: () => <button data-testid="insert-thematic-break">Insert Break</button>,
    ListsToggle: () => <button data-testid="lists-toggle">Lists</button>,
    StrikeThroughSupSubToggles: () => <button data-testid="strikethrough-toggle">Strikethrough</button>,
    UndoRedo: () => <button data-testid="undo-redo">Undo/Redo</button>,
  };
});

// Mock @codemirror/theme-one-dark
vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: {},
}));

// Mock @codemirror/language-data
vi.mock('@codemirror/language-data', () => ({
  languages: [
    { name: 'JavaScript', alias: ['js'], load: vi.fn().mockResolvedValue({}) },
    { name: 'TypeScript', alias: ['ts'], load: vi.fn().mockResolvedValue({}) },
    { name: 'Python', load: vi.fn().mockResolvedValue({}) },
  ],
}));

// Store onEmojiSelect callback for testing
let capturedOnEmojiSelect: ((emoji: { native: string }) => void) | null = null;

// Mock EmojiPickerDialog
vi.mock('@/components/molecules', () => ({
  EmojiPickerDialog: ({
    open,
    onOpenChange,
    onEmojiSelect,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEmojiSelect: (emoji: { native: string }) => void;
  }) => {
    // Capture the callback for testing
    capturedOnEmojiSelect = onEmojiSelect;
    if (!open) return null;
    return (
      <div data-testid="emoji-picker-dialog">
        <button
          data-testid="emoji-select-button"
          onClick={() => {
            // Match real EmojiPickerDialog behavior: call onEmojiSelect then close
            onEmojiSelect({ native: '🎉' });
            onOpenChange(false);
          }}
        >
          Select Emoji
        </button>
      </div>
    );
  },
}));

// Mock icons
vi.mock('@/libs/icons', () => ({
  Smile: ({ className }: { className?: string }) => (
    <svg data-testid="smile-icon" className={className}>
      <title>Smile</title>
    </svg>
  ),
  AlertTriangle: ({ className }: { className?: string }) => (
    <svg data-testid="alert-triangle-icon" className={className}>
      <title>Alert Triangle</title>
    </svg>
  ),
  Type: ({ className }: { className?: string }) => (
    <svg data-testid="type-icon" className={className}>
      <title>Type</title>
    </svg>
  ),
  MarkdownMark: ({ className }: { className?: string }) => (
    <svg data-testid="markdown-mark-icon" className={className}>
      <title>Markdown Mark</title>
    </svg>
  ),
}));

// Mock useEmojiInsert hook
const mockHandleMarkdownEmojiSelect = vi.fn();
vi.mock('@/hooks', () => ({
  useEmojiInsert: vi.fn(() => mockHandleMarkdownEmojiSelect),
}));

// Mock @/atoms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <div className={className} data-override-defaults={overrideDefaults} {...props}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    className,
    overrideDefaults,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <span className={className} data-override-defaults={overrideDefaults} {...props}>
      {children}
    </span>
  ),
  Button: ({
    children,
    className,
    variant,
    size,
    disabled,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    variant?: string;
    size?: string;
    disabled?: boolean;
    title?: string;
    onClick?: () => void;
  }) => (
    <button className={className} data-variant={variant} data-size={size} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Textarea: vi.fn(({ className, readOnly, ...props }: Record<string, unknown>) => (
    <textarea className={className as string} readOnly={readOnly as boolean} {...(props as Record<string, string>)} />
  )),
}));

// Mock @/libs/utils
vi.mock('@/libs/utils', () => ({
  cn: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
}));

describe('InitializedMDXEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolbarContentsRenderer = null;
    capturedOnEmojiSelect = null;
    capturedOnChange = null;
    mockHandleMarkdownEmojiSelect.mockClear();
  });

  describe('Rich Text Mode (default)', () => {
    it('renders the MDXEditor component', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      expect(screen.getByTestId('mdx-editor')).toBeInTheDocument();
    });

    it('renders with correct placeholder text', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('data-placeholder', 'Start writing your masterpiece');
    });

    it('renders with correct CSS classes including dark-theme and cursor-auto', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveClass('dark-theme');
      expect(editor).toHaveClass('cursor-auto');
    });

    it('does not apply hidden class to MDXEditor in richtext mode', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor.className).not.toContain('hidden');
    });

    it('applies contentEditableClassName with prose styles', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const editor = screen.getByTestId('mdx-editor');
      const contentEditableClass = editor.getAttribute('data-content-editable-class');
      expect(contentEditableClass).toContain('prose');
      expect(contentEditableClass).toContain('prose-neutral');
      expect(contentEditableClass).toContain('prose-invert');
    });

    it('configures plugins correctly', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const editor = screen.getByTestId('mdx-editor');
      // The editor should have 9 plugins configured
      expect(editor).toHaveAttribute('data-plugins-count', '9');
    });

    it('passes additional props to MDXEditor', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="# Hello World" />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('markdown', '# Hello World');
    });

    it('passes readOnly prop to MDXEditor', () => {
      render(<InitializedMDXEditor editorRef={null} readOnly />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('data-readonly', 'true');
    });

    it('renders toolbar with all controls', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      expect(screen.getByTestId('toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('undo-redo')).toBeInTheDocument();
      expect(screen.getByTestId('block-type-select')).toBeInTheDocument();
      expect(screen.getByTestId('bold-italic-toggles')).toBeInTheDocument();
      expect(screen.getByTestId('strikethrough-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('lists-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('insert-thematic-break')).toBeInTheDocument();
      expect(screen.getByTestId('code-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('insert-code-block')).toBeInTheDocument();
    });

    it('renders emoji button with tooltip in toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      expect(emojiButton).toBeInTheDocument();
      expect(emojiButton).toHaveAttribute('title', 'Emoji');
    });

    it('renders markdown toggle button with tooltip in toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      expect(markdownButton).toBeInTheDocument();
      expect(markdownButton).toHaveAttribute('title', 'Markdown');
    });

    it('renders smile icons in emoji buttons', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const smileIcons = screen.getAllByTestId('smile-icon');
      // One in the markdown toolbar, one in the rich text toolbar
      expect(smileIcons).toHaveLength(2);
      smileIcons.forEach((icon) => {
        expect(icon).toHaveClass('size-6');
      });
    });

    it('renders markdown mark icon in markdown button', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const markdownIcon = screen.getByTestId('markdown-mark-icon');
      expect(markdownIcon).toBeInTheDocument();
      expect(markdownIcon).toHaveClass('size-6');
    });

    it('does not show emoji picker dialog initially', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      expect(screen.queryByTestId('emoji-picker-dialog')).not.toBeInTheDocument();
    });

    it('opens emoji picker dialog when emoji button is clicked', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      fireEvent.click(emojiButton);

      expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
    });

    it('provides onEmojiSelect callback to EmojiPickerDialog', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      // Open emoji picker to trigger the callback capture
      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      fireEvent.click(emojiButton);

      // Verify callback was captured (component properly passed it)
      expect(capturedOnEmojiSelect).toBeDefined();
      expect(typeof capturedOnEmojiSelect).toBe('function');
    });

    it('closes emoji picker dialog after selecting emoji', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      // Open emoji picker
      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      fireEvent.click(emojiButton);
      expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();

      // Select an emoji - dialog closes (EmojiPickerDialog calls onOpenChange(false))
      const selectEmojiButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectEmojiButton);

      // Dialog should be closed
      expect(screen.queryByTestId('emoji-picker-dialog')).not.toBeInTheDocument();
    });

    it('accepts a ref for editor methods', () => {
      const editorRef = createRef<MDXEditorMethods>();
      render(<InitializedMDXEditor editorRef={editorRef} />);

      expect(screen.getByTestId('mdx-editor')).toBeInTheDocument();
    });
  });

  describe('Markdown Mode Toolbar and Textarea', () => {
    it('renders markdown toolbar hidden by default in richtext mode', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar).toBeInTheDocument();
      expect(markdownToolbar.className).toContain('hidden');
    });

    it('renders markdown textarea hidden by default in richtext mode', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const markdownTextarea = screen.getByTestId('markdown-textarea');
      expect(markdownTextarea).toBeInTheDocument();
      expect(markdownTextarea.className).toContain('hidden');
    });

    it('renders markdown toolbar with correct aria attributes', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar).toHaveAttribute('role', 'toolbar');
      expect(markdownToolbar).toHaveAttribute('aria-label', 'Markdown editing toolbar');
    });

    it('renders emoji button in markdown toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const emojiButton = screen.getByTestId('markdown-emoji-button');
      expect(emojiButton).toBeInTheDocument();
      expect(emojiButton).toHaveAttribute('title', 'Emoji');
    });

    it('renders rich text button in markdown toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const richTextButton = screen.getByTestId('markdown-richtext-button');
      expect(richTextButton).toBeInTheDocument();
      expect(richTextButton).toHaveAttribute('title', 'Rich Text');
    });

    it('renders type icon in rich text mode switch button', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      expect(screen.getByTestId('type-icon')).toBeInTheDocument();
    });

    it('disables markdown toolbar buttons when readOnly', () => {
      render(<InitializedMDXEditor editorRef={null} readOnly />);

      const emojiButton = screen.getByTestId('markdown-emoji-button');
      const richTextButton = screen.getByTestId('markdown-richtext-button');
      expect(emojiButton).toBeDisabled();
      expect(richTextButton).toBeDisabled();
    });

    it('renders markdown textarea with correct placeholder', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveAttribute('placeholder', 'Start writing your masterpiece');
    });
  });

  describe('Mode Switching', () => {
    it('switches to markdown mode when markdown button is clicked', () => {
      const mockGetMarkdown = vi.fn().mockReturnValue('# Hello');
      const editorRef = {
        current: {
          getMarkdown: mockGetMarkdown,
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      fireEvent.click(markdownButton);

      // MDXEditor should now have hidden class
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).toContain('hidden');

      // Markdown toolbar should no longer have hidden class
      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar.className).not.toContain('hidden');

      // Markdown textarea should no longer have hidden class
      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea.className).not.toContain('hidden');
    });

    it('populates textarea with editor content when switching to markdown mode', () => {
      const mockGetMarkdown = vi.fn().mockReturnValue('# Hello from editor');
      const editorRef = {
        current: {
          getMarkdown: mockGetMarkdown,
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      fireEvent.click(markdownButton);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('# Hello from editor');
    });

    it('switches back to richtext mode when rich text button is clicked', () => {
      const mockSetMarkdown = vi.fn();
      const editorRef = {
        current: {
          getMarkdown: vi.fn().mockReturnValue('# Test'),
          setMarkdown: mockSetMarkdown,
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      // Switch to markdown mode first
      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      fireEvent.click(markdownButton);

      // Then switch back to richtext mode
      const richTextButton = screen.getByTestId('markdown-richtext-button');
      fireEvent.click(richTextButton);

      // MDXEditor should not have hidden class
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).not.toContain('hidden');

      // Markdown toolbar should have hidden class
      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar.className).toContain('hidden');

      // setMarkdown should have been called on the editor ref
      expect(mockSetMarkdown).toHaveBeenCalled();
    });
  });

  describe('Markdown Mode Text Editing', () => {
    it('updates textarea value when typing in markdown mode', () => {
      const editorRef = {
        current: {
          getMarkdown: vi.fn().mockReturnValue(''),
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '# New content' } });

      expect(textarea).toHaveValue('# New content');
    });

    it('does not update textarea value when exceeding max length', () => {
      const editorRef = {
        current: {
          getMarkdown: vi.fn().mockReturnValue(''),
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      const overLimitContent = 'a'.repeat(MOCK_MAX_LENGTH + 1);
      fireEvent.change(textarea, { target: { value: overLimitContent } });

      // Should remain empty since input exceeds max
      expect(textarea).toHaveValue('');
    });

    it('calls props.onChange when typing in markdown mode', () => {
      const mockOnChange = vi.fn();
      const editorRef = {
        current: {
          getMarkdown: vi.fn().mockReturnValue(''),
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} onChange={mockOnChange} />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '# Test content' } });

      expect(mockOnChange).toHaveBeenCalledWith('# Test content', false);
    });

    it('opens emoji picker from markdown toolbar emoji button', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      const markdownEmojiButton = screen.getByTestId('markdown-emoji-button');
      fireEvent.click(markdownEmojiButton);

      expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
    });
  });

  describe('Max Length Warning (Rich Text Mode)', () => {
    it('does not show max length warning initially', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      expect(screen.queryByTestId('max-length-warning')).not.toBeInTheDocument();
    });

    it('shows approaching warning when less than 100 characters remaining', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      // Simulate typing content that leaves 99 characters remaining
      const contentLength = MOCK_MAX_LENGTH - 99;
      act(() => {
        capturedOnChange?.('a'.repeat(contentLength));
      });

      const warning = screen.getByTestId('max-length-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveClass('bg-yellow-500/15');
      expect(warning).toHaveClass('text-yellow-500');
      expect(screen.getByText("You're approaching the maximum character limit.")).toBeInTheDocument();
    });

    it('shows reached warning when at maximum length', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      // Simulate typing content that reaches exactly the max length
      act(() => {
        capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH));
      });

      const warning = screen.getByTestId('max-length-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveClass('bg-red-500/15');
      expect(warning).toHaveClass('text-red-500');
      expect(screen.getByText("You've reached the maximum character limit.")).toBeInTheDocument();
    });

    it('clears warning when content is reduced below threshold', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      // First, trigger the warning
      act(() => {
        capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH - 50));
      });
      expect(screen.getByTestId('max-length-warning')).toBeInTheDocument();

      // Then reduce content to clear warning (more than 100 chars remaining)
      act(() => {
        capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH - 150));
      });
      expect(screen.queryByTestId('max-length-warning')).not.toBeInTheDocument();
    });

    it('calls props.onChange when provided', () => {
      const mockOnChange = vi.fn();
      render(<InitializedMDXEditor editorRef={null} onChange={mockOnChange} />);

      const testMarkdown = '# Test content';
      act(() => {
        capturedOnChange?.(testMarkdown);
      });

      expect(mockOnChange).toHaveBeenCalledWith(testMarkdown, undefined);
    });

    it('renders alert triangle icon in max length warning', () => {
      render(<InitializedMDXEditor editorRef={null} />);

      // Trigger the warning
      act(() => {
        capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH - 50));
      });

      const alertIcon = screen.getByTestId('alert-triangle-icon');
      expect(alertIcon).toBeInTheDocument();
      expect(alertIcon).toHaveClass('size-4');
      expect(alertIcon).toHaveClass('shrink-0');
    });
  });

  describe('Max Length Warning (Markdown Mode)', () => {
    it('shows approaching warning in markdown mode when less than 100 chars remaining', () => {
      const editorRef = {
        current: {
          getMarkdown: vi.fn().mockReturnValue(''),
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      // Type content near the limit
      const contentLength = MOCK_MAX_LENGTH - 50;
      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: 'a'.repeat(contentLength) } });

      const warning = screen.getByTestId('max-length-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveClass('bg-yellow-500/15');
    });

    it('shows reached warning in markdown mode when at max length', () => {
      const editorRef = {
        current: {
          getMarkdown: vi.fn().mockReturnValue(''),
          setMarkdown: vi.fn(),
          focus: vi.fn(),
          insertMarkdown: vi.fn(),
        },
      } as unknown as React.RefObject<MDXEditorMethods>;

      render(<InitializedMDXEditor editorRef={editorRef} />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: 'a'.repeat(MOCK_MAX_LENGTH) } });

      const warning = screen.getByTestId('max-length-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveClass('bg-red-500/15');
    });
  });
});

describe('InitializedMDXEditor - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolbarContentsRenderer = null;
    capturedOnEmojiSelect = null;
    capturedOnChange = null;
    mockHandleMarkdownEmojiSelect.mockClear();
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with markdown content', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="# Test Content" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with emoji picker open', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} />);

    const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
    fireEvent.click(emojiButton);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} className="custom-editor-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with approaching max length warning', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} />);

    // Trigger approaching warning
    act(() => {
      capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH - 50));
    });

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with reached max length warning', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} />);

    // Trigger reached warning
    act(() => {
      capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH));
    });

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in markdown mode', () => {
    const editorRef = {
      current: {
        getMarkdown: vi.fn().mockReturnValue('# Hello'),
        setMarkdown: vi.fn(),
        focus: vi.fn(),
        insertMarkdown: vi.fn(),
      },
    } as unknown as React.RefObject<MDXEditorMethods>;

    const { container } = render(<InitializedMDXEditor editorRef={editorRef} />);

    // Switch to markdown mode
    fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with readOnly prop', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} readOnly />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
