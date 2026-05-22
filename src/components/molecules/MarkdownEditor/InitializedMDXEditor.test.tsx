import React, { createRef } from 'react';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import InitializedMDXEditor from './InitializedMDXEditor';

// Mock config - use a smaller value for easier testing
const MOCK_MAX_LENGTH = 1000;
vi.mock('@/config/posts', () => ({
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
          data-placeholder={placeholder as string | undefined}
          className={className as string | undefined}
          data-content-editable-class={contentEditableClassName as string | undefined}
          data-plugins-count={Array.isArray(plugins) ? plugins.length : undefined}
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
    linkDialogPlugin: vi.fn(() => ({ type: 'linkDialog' })),
    codeBlockPlugin: vi.fn(() => ({ type: 'codeBlock' })),
    codeMirrorPlugin: vi.fn(() => ({ type: 'codeMirror' })),
    maxLengthPlugin: vi.fn(() => ({ type: 'maxLength' })),
    BlockTypeSelect: () => <button data-testid="block-type-select">Block Type</button>,
    BoldItalicUnderlineToggles: () => <button data-testid="bold-italic-toggles">Bold/Italic</button>,
    ButtonWithTooltip: ({
      children,
      title,
      onClick,
      disabled,
      className,
    }: {
      children: React.ReactNode;
      title: string;
      onClick: () => void;
      disabled?: boolean;
      className?: string;
    }) => (
      <button
        data-testid={`button-with-tooltip-${title.toLowerCase()}`}
        title={title}
        onClick={onClick}
        disabled={disabled}
        className={className}
      >
        {children}
      </button>
    ),
    CreateLink: () => <button data-testid="create-link">Create Link</button>,
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
  };
});

// Mock useEmojiInsert hook
const mockHandleMarkdownEmojiSelect = vi.fn();
vi.mock('@/hooks/useEmojiInsert/useEmojiInsert', () => ({
  useEmojiInsert: vi.fn(() => mockHandleMarkdownEmojiSelect),
}));

// Mock @/atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
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
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
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
  };
});

vi.mock('@/atoms/Textarea/Textarea', () => {
  return {
    Textarea: vi.fn(({ className, readOnly, ...props }: Record<string, unknown>) => (
      <textarea className={className as string} readOnly={readOnly as boolean} {...(props as Record<string, string>)} />
    )),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
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
  };
});

/** Creates a mock editor ref with stub methods for mode-switching tests. */
function createMockEditorRef(markdown = '') {
  return asOpaque<React.RefObject<MDXEditorMethods>>({
    current: {
      getMarkdown: vi.fn(() => markdown),
      setMarkdown: vi.fn(),
      focus: vi.fn(),
      insertMarkdown: vi.fn(),
    },
  });
}

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
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      expect(screen.getByTestId('mdx-editor')).toBeInTheDocument();
    });

    it('renders with correct placeholder text', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('data-placeholder', 'Start writing your masterpiece');
    });

    it('renders with correct CSS classes including dark-theme and cursor-auto', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveClass('dark-theme');
      expect(editor).toHaveClass('cursor-auto');
    });

    it('does not apply hidden class to MDXEditor in richtext mode', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor.className).not.toContain('hidden');
    });

    it('applies contentEditableClassName with prose styles', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const editor = screen.getByTestId('mdx-editor');
      const contentEditableClass = editor.getAttribute('data-content-editable-class');
      expect(contentEditableClass).toContain('prose');
      expect(contentEditableClass).toContain('prose-neutral');
      expect(contentEditableClass).toContain('prose-invert');
    });

    it('configures plugins correctly', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const editor = screen.getByTestId('mdx-editor');
      // The editor should have 10 plugins configured
      expect(editor).toHaveAttribute('data-plugins-count', '10');
    });

    it('passes additional props to MDXEditor', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="# Hello World" />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('markdown', '# Hello World');
    });

    it('passes readOnly prop to MDXEditor', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" readOnly />);

      const editor = screen.getByTestId('mdx-editor');
      expect(editor).toHaveAttribute('data-readonly', 'true');
    });

    it('renders toolbar with all controls', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      expect(screen.getByTestId('toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('undo-redo')).toBeInTheDocument();
      expect(screen.getByTestId('block-type-select')).toBeInTheDocument();
      expect(screen.getByTestId('bold-italic-toggles')).toBeInTheDocument();
      expect(screen.getByTestId('strikethrough-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('lists-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('insert-thematic-break')).toBeInTheDocument();
      expect(screen.getByTestId('create-link')).toBeInTheDocument();
      expect(screen.getByTestId('code-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('insert-code-block')).toBeInTheDocument();
    });

    it('renders emoji button with tooltip in toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      expect(emojiButton).toBeInTheDocument();
      expect(emojiButton).toHaveAttribute('title', 'Emoji');
    });

    it('renders markdown toggle button with tooltip in toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      expect(markdownButton).toBeInTheDocument();
      expect(markdownButton).toHaveAttribute('title', 'Markdown');
    });

    it('renders smile icons in emoji buttons', () => {
      const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const smileIcons = container.querySelectorAll('.lucide-smile');
      // One in the markdown toolbar, one in the rich text toolbar
      expect(smileIcons).toHaveLength(2);
      smileIcons.forEach((icon) => {
        expect(icon).toHaveClass('size-6');
      });
    });

    it('renders markdown mark icon in markdown button', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      const markdownIcon = markdownButton.querySelector('svg[viewBox="0 0 208 128"]');
      expect(markdownIcon).toBeInTheDocument();
      expect(markdownIcon).toHaveClass('size-6');
    });

    it('does not show emoji picker dialog initially', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      expect(screen.queryByTestId('emoji-picker-dialog')).not.toBeInTheDocument();
    });

    it('opens emoji picker dialog when emoji button is clicked', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      fireEvent.click(emojiButton);

      expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
    });

    it('provides onEmojiSelect callback to EmojiPickerDialog', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      // Open emoji picker to trigger the callback capture
      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      fireEvent.click(emojiButton);

      // Verify callback was captured (component properly passed it)
      expect(capturedOnEmojiSelect).toBeDefined();
      expect(typeof capturedOnEmojiSelect).toBe('function');
    });

    it('closes emoji picker dialog after selecting emoji', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

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
      render(<InitializedMDXEditor editorRef={editorRef} markdown="" />);

      expect(screen.getByTestId('mdx-editor')).toBeInTheDocument();
    });
  });

  describe('Markdown Mode Toolbar and Textarea', () => {
    it('renders markdown toolbar hidden by default in richtext mode', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar).toBeInTheDocument();
      // Hidden class is on the parent wrapper container, not on the toolbar itself
      expect(markdownToolbar.parentElement?.className).toContain('hidden');
    });

    it('renders markdown textarea hidden by default in richtext mode', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const markdownTextarea = screen.getByTestId('markdown-textarea');
      expect(markdownTextarea).toBeInTheDocument();
      // Hidden class is on the parent wrapper container, not on the textarea itself
      expect(markdownTextarea.closest('[class*="hidden"]')).not.toBeNull();
    });

    it('renders markdown toolbar with correct aria attributes', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar).toHaveAttribute('role', 'toolbar');
      expect(markdownToolbar).toHaveAttribute('aria-label', 'Markdown editing toolbar');
    });

    it('renders emoji button in markdown toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const emojiButton = screen.getByTestId('markdown-emoji-button');
      expect(emojiButton).toBeInTheDocument();
      expect(emojiButton).toHaveAttribute('title', 'Emoji');
    });

    it('renders rich text button in markdown toolbar', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const richTextButton = screen.getByTestId('markdown-richtext-button');
      expect(richTextButton).toBeInTheDocument();
      expect(richTextButton).toHaveAttribute('title', 'Rich Text');
    });

    it('renders type icon in rich text mode switch button', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const richTextButton = screen.getByTestId('markdown-richtext-button');
      expect(richTextButton.querySelector('.lucide-type')).toBeInTheDocument();
    });

    it('disables markdown toolbar buttons when readOnly', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" readOnly />);

      const emojiButton = screen.getByTestId('markdown-emoji-button');
      const richTextButton = screen.getByTestId('markdown-richtext-button');
      expect(emojiButton).toBeDisabled();
      expect(richTextButton).toBeDisabled();
    });

    it('renders markdown textarea with correct placeholder', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveAttribute('placeholder', 'Start writing your masterpiece');
    });
  });

  describe('Mode Switching', () => {
    it('switches to markdown mode when markdown button is clicked (empty content)', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      fireEvent.click(markdownButton);

      // MDXEditor should now have hidden class
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).toContain('hidden');

      // Markdown toolbar should be visible (parent wrapper should not have hidden)
      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar.parentElement?.className).not.toContain('hidden');

      // Markdown textarea should be visible
      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toBeInTheDocument();
    });

    it('switches to markdown mode and transfers content when rich text has content', () => {
      const mockRef = createMockEditorRef('# Hello');
      render(<InitializedMDXEditor editorRef={mockRef} markdown="# Hello" />);

      // Markdown button should be enabled (seamless toggle)
      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      expect(markdownButton).not.toBeDisabled();
      fireEvent.click(markdownButton);

      // MDXEditor should have hidden class (switched to markdown mode)
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).toContain('hidden');

      // Markdown textarea should have the content from editor ref's getMarkdown()
      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('# Hello');
    });

    it('markdown button always shows Markdown title regardless of content', () => {
      const { unmount } = render(<InitializedMDXEditor editorRef={null} markdown="" />);
      expect(screen.getByTestId('button-with-tooltip-markdown')).toHaveAttribute('title', 'Markdown');
      unmount();

      // Even with content, title is still "Markdown" (no more "Clear content to switch modes")
      render(<InitializedMDXEditor editorRef={null} markdown="# Content" />);
      expect(screen.getByTestId('button-with-tooltip-markdown')).toHaveAttribute('title', 'Markdown');
    });

    it('switches back to richtext mode when rich text button is clicked (empty markdown)', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown mode first
      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      fireEvent.click(markdownButton);

      // Then switch back to richtext mode (markdown text is empty)
      const richTextButton = screen.getByTestId('markdown-richtext-button');
      fireEvent.click(richTextButton);

      // MDXEditor should not have hidden class
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).not.toContain('hidden');

      // Markdown toolbar parent should have hidden class
      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar.parentElement?.className).toContain('hidden');
    });

    it('switches back to richtext mode and transfers content when markdown has content', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown mode
      const markdownButton = screen.getByTestId('button-with-tooltip-markdown');
      fireEvent.click(markdownButton);

      // Type content in markdown textarea
      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '# Some content' } });

      // Rich text button should be enabled and show Rich Text title
      const richTextButton = screen.getByTestId('markdown-richtext-button');
      expect(richTextButton).toHaveAttribute('title', 'Rich Text');
      expect(richTextButton).not.toBeDisabled();

      fireEvent.click(richTextButton);

      // Should switch to richtext mode - MDXEditor should not have hidden class
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).not.toContain('hidden');

      // Markdown toolbar parent should have hidden class
      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar.parentElement?.className).toContain('hidden');

      // setMarkdown should have been called with the content
      expect(mockRef.current.setMarkdown).toHaveBeenCalledWith('# Some content');
    });

    it('sanitizes code blocks without language when switching from markdown to richtext', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '```\nconsole.log("test")\n```' } });

      fireEvent.click(screen.getByTestId('markdown-richtext-button'));

      // Code block without language should get 'plaintext' added
      expect(mockRef.current.setMarkdown).toHaveBeenCalledWith('```plaintext\nconsole.log("test")\n```');
    });

    it('resolves language aliases when switching from markdown to richtext', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '```js\nconsole.log("test")\n```' } });

      fireEvent.click(screen.getByTestId('markdown-richtext-button'));

      // 'js' alias should be resolved to 'javascript'
      expect(mockRef.current.setMarkdown).toHaveBeenCalledWith('```javascript\nconsole.log("test")\n```');
    });

    it('replaces unsupported languages with plaintext when switching from markdown to richtext', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '```haskell\n++++++++\n```' } });

      fireEvent.click(screen.getByTestId('markdown-richtext-button'));

      expect(mockRef.current.setMarkdown).toHaveBeenCalledWith('```plaintext\n++++++++\n```');
    });

    it('transfers richtext content to markdown textarea when switching modes', () => {
      const mockRef = createMockEditorRef('# Hello World\n\nSome **bold** text.');
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      // Textarea should have the editor content from getMarkdown()
      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('# Hello World\n\nSome **bold** text.');
    });

    it('updates max length warning when sanitization changes content length', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      // Build content where sanitization pushes it past the approaching threshold.
      // Each bare ``` gets 'plaintext' appended (9 extra chars). With 3 bare fences
      // that's 27 extra chars. We want the pre-sanitized length to be safely under
      // the threshold, but post-sanitized length to be within 100 chars of the limit.
      const fences = '```\nx\n```\n\n```\nx\n```\n\n```\nx\n```';
      const padding = 'a'.repeat(MOCK_MAX_LENGTH - 100 - fences.length - 2);
      const content = padding + '\n\n' + fences;

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: content } });

      // No warning yet in markdown mode (content is under threshold before sanitization)
      expect(screen.queryByTestId('max-length-warning')).not.toBeInTheDocument();

      // Switch to richtext — sanitization adds 'plaintext' to each fence, pushing length up
      fireEvent.click(screen.getByTestId('markdown-richtext-button'));

      const warning = screen.getByTestId('max-length-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveClass('bg-yellow-500/15');
    });

    it('clears max length warning when switching to richtext if sanitized content is short', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      // Type content near the limit to trigger a warning in markdown mode
      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: 'a'.repeat(MOCK_MAX_LENGTH - 50) } });
      expect(screen.getByTestId('max-length-warning')).toBeInTheDocument();

      // Replace with short content and switch back
      fireEvent.change(textarea, { target: { value: 'short' } });
      fireEvent.click(screen.getByTestId('markdown-richtext-button'));

      expect(screen.queryByTestId('max-length-warning')).not.toBeInTheDocument();
    });

    it('does not switch modes when editorRef is null', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      // Click markdown button — should be a no-op since editorRef is null
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      // Should still be in richtext mode
      const mdxEditor = screen.getByTestId('mdx-editor');
      expect(mdxEditor.className).not.toContain('hidden');
      const markdownToolbar = screen.getByTestId('markdown-toolbar');
      expect(markdownToolbar.parentElement?.className).toContain('hidden');
    });

    it('calls focus and insertMarkdown on editor ref when selecting emoji in richtext mode', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Open emoji picker and select an emoji
      const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
      fireEvent.click(emojiButton);

      const selectEmojiButton = screen.getByTestId('emoji-select-button');
      fireEvent.click(selectEmojiButton);

      // Should call focus, insertMarkdown, focus on the editor ref
      expect(mockRef.current.focus).toHaveBeenCalledTimes(2);
      expect(mockRef.current.insertMarkdown).toHaveBeenCalledWith('🎉');
    });

    it('round-trips content through mode switches preserving supported languages', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown → type content → switch back to richtext
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '```javascript\nconsole.log("test")\n```' } });

      fireEvent.click(screen.getByTestId('markdown-richtext-button'));

      // Supported languages should pass through unchanged
      expect(mockRef.current.setMarkdown).toHaveBeenCalledWith('```javascript\nconsole.log("test")\n```');
    });
  });

  describe('Markdown Mode Text Editing', () => {
    it('updates textarea value when typing in markdown mode', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '# New content' } });

      expect(textarea).toHaveValue('# New content');
    });

    it('does not update textarea value when exceeding max length', () => {
      // Note: This tests a JSDOM-only path. In a real browser, the native
      // maxLength attribute truncates pasted content before firing onChange,
      // so the handler would never receive more than ARTICLE_MAX_CHARACTER_LENGTH
      // characters. JSDOM does not enforce maxLength, allowing us to verify
      // the JS guard works as a defense-in-depth measure.
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      const overLimitContent = 'a'.repeat(MOCK_MAX_LENGTH + 1);
      fireEvent.change(textarea, { target: { value: overLimitContent } });

      // Should remain empty since input exceeds max
      expect(textarea).toHaveValue('');
    });

    it('accepts content at exactly the max character length', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      const exactLimitContent = 'a'.repeat(MOCK_MAX_LENGTH);
      fireEvent.change(textarea, { target: { value: exactLimitContent } });

      // Content at exactly the limit should be accepted
      expect(textarea).toHaveValue(exactLimitContent);
    });

    it('calls props.onChange when typing in markdown mode', () => {
      const mockOnChange = vi.fn();
      const mockRef = createMockEditorRef();

      render(<InitializedMDXEditor editorRef={mockRef} markdown="" onChange={mockOnChange} />);

      // Switch to markdown mode
      fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

      const textarea = screen.getByTestId('markdown-textarea');
      fireEvent.change(textarea, { target: { value: '# Test content' } });

      expect(mockOnChange).toHaveBeenCalledWith('# Test content', false);
    });

    it('opens emoji picker from markdown toolbar emoji button', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      const markdownEmojiButton = screen.getByTestId('markdown-emoji-button');
      fireEvent.click(markdownEmojiButton);

      expect(screen.getByTestId('emoji-picker-dialog')).toBeInTheDocument();
    });
  });

  describe('Max Length Warning (Rich Text Mode)', () => {
    it('does not show max length warning initially', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      expect(screen.queryByTestId('max-length-warning')).not.toBeInTheDocument();
    });

    it('shows approaching warning when less than 100 characters remaining', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

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
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

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
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

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
      render(<InitializedMDXEditor editorRef={null} markdown="" onChange={mockOnChange} />);

      const testMarkdown = '# Test content';
      act(() => {
        capturedOnChange?.(testMarkdown);
      });

      expect(mockOnChange).toHaveBeenCalledWith(testMarkdown, undefined);
    });

    it('renders alert triangle icon in max length warning', () => {
      render(<InitializedMDXEditor editorRef={null} markdown="" />);

      // Trigger the warning
      act(() => {
        capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH - 50));
      });

      const warning = screen.getByTestId('max-length-warning');
      const alertIcon = warning.querySelector('.lucide-triangle-alert');
      expect(alertIcon).toBeInTheDocument();
      expect(alertIcon).toHaveClass('size-4');
      expect(alertIcon).toHaveClass('shrink-0');
    });
  });

  describe('Max Length Warning (Markdown Mode)', () => {
    it('shows approaching warning in markdown mode when less than 100 chars remaining', () => {
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

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
      const mockRef = createMockEditorRef();
      render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

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
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with markdown content', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="# Test Content" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with emoji picker open', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" />);

    const emojiButton = screen.getByTestId('button-with-tooltip-emoji');
    fireEvent.click(emojiButton);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" className="custom-editor-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with approaching max length warning', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" />);

    // Trigger approaching warning
    act(() => {
      capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH - 50));
    });

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with reached max length warning', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" />);

    // Trigger reached warning
    act(() => {
      capturedOnChange?.('a'.repeat(MOCK_MAX_LENGTH));
    });

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in markdown mode', () => {
    const mockRef = createMockEditorRef();
    const { container } = render(<InitializedMDXEditor editorRef={mockRef} markdown="" />);

    // Switch to markdown mode
    fireEvent.click(screen.getByTestId('button-with-tooltip-markdown'));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with readOnly prop', () => {
    const { container } = render(<InitializedMDXEditor editorRef={null} markdown="" readOnly />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
