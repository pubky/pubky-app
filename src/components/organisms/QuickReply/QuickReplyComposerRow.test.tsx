import { type ComponentProps, createRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickReplyComposerRow } from './QuickReplyComposerRow';

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('@/atoms/Textarea/Textarea', () => ({
  Textarea: ({ 'data-testid': dataTestId, ...props }: { 'data-testid'?: string; [key: string]: unknown }) => (
    <textarea data-testid={dataTestId ?? 'textarea'} {...props} />
  ),
}));

vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({
  MentionPopover: ({
    users,
    selectedIndex,
    onSelect,
    onHover,
  }: {
    users: { id: string; name: string }[];
    selectedIndex: number | null;
    onSelect: (userId: string) => void;
    onHover: (index: number) => void;
  }) => (
    <div data-testid="mention-popover" data-selected-index={selectedIndex}>
      {users.map((user, index) => (
        <button
          key={user.id}
          type="button"
          data-testid={`mention-${index}`}
          onClick={() => onSelect(user.id)}
          onMouseEnter={() => onHover(index)}
        >
          {user.name}
        </button>
      ))}
    </div>
  ),
}));

type QuickReplyComposerRowProps = ComponentProps<typeof QuickReplyComposerRow>;

const createProps = (overrides: Partial<QuickReplyComposerRowProps> = {}): QuickReplyComposerRowProps => ({
  textareaRef: createRef<HTMLTextAreaElement>(),
  textareaClassName: undefined,
  content: 'hello',
  displayPlaceholder: 'Reply here',
  isSubmitting: false,
  isAuthenticated: true,
  onChange: vi.fn(),
  onFocus: vi.fn(),
  onKeyDown: vi.fn(),
  onPaste: vi.fn(),
  mentionIsOpen: false,
  mentionUsers: [],
  mentionSelectedIndex: null,
  onMentionSelect: vi.fn(),
  onMentionHover: vi.fn(),
  ...overrides,
});

describe('QuickReplyComposerRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the textarea with reply state', () => {
    render(<QuickReplyComposerRow {...createProps({ textareaClassName: 'text-base' })} />);

    const textarea = screen.getByTestId('quick-reply-textarea');
    expect(textarea).toHaveValue('hello');
    expect(textarea).toHaveAttribute('placeholder', 'Reply here');
    expect(textarea).toHaveAttribute('aria-label', 'Reply');
    expect(textarea).toHaveAttribute('aria-haspopup', 'listbox');
    expect(textarea).toHaveClass('text-base');
  });

  it('locks the textarea while submitting or signed out', () => {
    render(<QuickReplyComposerRow {...createProps({ isSubmitting: true, isAuthenticated: false })} />);

    const textarea = screen.getByTestId('quick-reply-textarea');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute('readonly');
  });

  it('forwards textarea events to the provided handlers', () => {
    const onChange = vi.fn();
    const onFocus = vi.fn();
    const onKeyDown = vi.fn();
    const onPaste = vi.fn();
    render(<QuickReplyComposerRow {...createProps({ content: '', onChange, onFocus, onKeyDown, onPaste })} />);

    const textarea = screen.getByTestId('quick-reply-textarea');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'typed reply' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.paste(textarea);

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('renders mention suggestions when the popover is open', () => {
    const onMentionSelect = vi.fn();
    const onMentionHover = vi.fn();
    render(
      <QuickReplyComposerRow
        {...createProps({
          mentionIsOpen: true,
          mentionUsers: [{ id: 'pk:bob', name: 'Bob' }],
          mentionSelectedIndex: 0,
          onMentionSelect,
          onMentionHover,
        })}
      />,
    );

    expect(screen.getByTestId('mention-popover')).toHaveAttribute('data-selected-index', '0');

    fireEvent.mouseEnter(screen.getByTestId('mention-0'));
    fireEvent.click(screen.getByTestId('mention-0'));

    expect(onMentionHover).toHaveBeenCalledWith(0);
    expect(onMentionSelect).toHaveBeenCalledWith('pk:bob');
  });
});
