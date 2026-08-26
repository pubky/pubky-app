import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { getLucideIconState, requestLucideIcon } from '@/libs/lucide/lucideIcons';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { CustomFeedDialog } from './CustomFeedDialog';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div data-testid="dialog" data-open={open} onClick={() => onOpenChange?.(!open)}>
        {children}
      </div>
    ),
    DialogTrigger: ({
      children,
      asChild,
      disabled,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
      disabled?: boolean;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId ?? 'dialog-trigger'} data-as-child={asChild} data-disabled={disabled}>
        {children}
      </div>
    ),
    DialogContent: ({
      children,
      className,
      _onOpenAutoFocus,
      _onCloseAutoFocus,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      _onOpenAutoFocus?: (e: Event) => void;
      _onCloseAutoFocus?: (e: Event) => void;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId ?? 'dialog-content'} className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
  };
});

// Mock router
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock('@/molecules/PostTag/PostTag', () => {
  return {
    PostTag: ({ label, showClose, onClose }: { label: string; showClose?: boolean; onClose?: () => void }) => (
      <span data-testid={`post-tag-${label}`} data-show-close={showClose}>
        {label}
        {showClose && (
          <button data-testid={`remove-tag-${label}`} onClick={onClose}>
            ×
          </button>
        )}
      </span>
    ),
  };
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  return {
    TagInput: ({
      onTagAdd,
      existingTags,
      disabled,
      maxTags,
      currentTagsCount,
      showEmojiButton,
      className,
      'data-testid': dataTestId,
    }: {
      onTagAdd: (tag: string) => void;
      existingTags: { label: string }[];
      showCloseButton?: boolean;
      disabled?: boolean;
      maxTags?: number;
      currentTagsCount?: number;
      showEmojiButton?: boolean;
      enableApiSuggestions?: boolean;
      excludeFromApiSuggestions?: string[];
      addOnSuggestionClick?: boolean;
      className?: string;
      'data-testid'?: string;
    }) => (
      <div
        data-testid={dataTestId ?? 'tag-input'}
        data-disabled={disabled}
        data-max-tags={maxTags}
        data-current-tags-count={currentTagsCount}
        data-show-emoji-button={showEmojiButton}
        className={className}
      >
        <input
          data-testid={dataTestId === 'feed-profile-tag-input' ? 'profile-tag-input-field' : 'tag-input-field'}
          onChange={(e) => {
            if (e.target.value) onTagAdd(e.target.value);
          }}
        />
        {existingTags.map((t, i) => (
          <span key={i} data-testid={`existing-tag-${i}`}>
            {t.label}
          </span>
        ))}
      </div>
    ),
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({ toast: mockToast }),
  };
});

vi.mock('@/organisms/IconPickerDialog/IconPickerDialog', () => ({
  IconPickerDialog: ({
    children,
    value,
    onSelect,
    title,
    description,
  }: {
    children: React.ReactNode;
    value?: string | null;
    onSelect: (iconName: string) => void;
    title?: string;
    description?: string;
  }) => (
    <div data-testid="icon-picker-dialog" data-value={value} data-title={title} data-description={description}>
      {children}
      <button type="button" data-testid="choose-mountain-icon" onClick={() => onSelect('mountain')}>
        Mountain
      </button>
    </div>
  ),
}));

// Mock dependencies
const mockCommitCreate = vi.fn();
const mockCommitUpdate = vi.fn();
const mockCommitDelete = vi.fn();
vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mockCommitCreate(...args),
    commitUpdate: (...args: unknown[]) => mockCommitUpdate(...args),
    commitDelete: (...args: unknown[]) => mockCommitDelete(...args),
  },
}));

// Mock atoms — use lightweight mocks that forward data-testid attributes
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      size,
      onClick,
      disabled,
      className,
      type,
      'aria-label': ariaLabel,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      onClick?: () => void;
      disabled?: boolean;
      className?: string;
      type?: 'button' | 'submit' | 'reset';
      'aria-label'?: string;
      'data-testid'?: string;
    }) => (
      <button
        data-testid={dataTestId ?? `button-${variant ?? 'default'}`}
        data-variant={variant}
        data-size={size}
        onClick={onClick}
        disabled={disabled}
        className={className}
        type={type}
        aria-label={ariaLabel}
      >
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
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId ?? 'container'} className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Input/Input', () => {
  return {
    Input: ({
      required,
      placeholder,
      value,
      onChange,
      disabled,
      className,
      'data-testid': dataTestId,
    }: {
      required?: boolean;
      placeholder?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      disabled?: boolean;
      className?: string;
      'data-testid'?: string;
    }) => (
      <input
        data-testid={dataTestId ?? 'input'}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
      />
    ),
  };
});

vi.mock('@/atoms/Label/Label', () => {
  return {
    Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <label data-testid="label" className={className}>
        {children}
      </label>
    ),
  };
});

vi.mock('@/atoms/Select/Select', () => {
  return {
    Select: ({
      children,
      value,
      onValueChange,
      disabled,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId ?? 'select'} data-value={value} data-disabled={disabled}>
        {children}
        <input
          data-testid={`${dataTestId ?? 'select'}-hidden-input`}
          type="text"
          hidden
          aria-hidden="true"
          value={value ?? ''}
          onChange={(e) => onValueChange?.(e.target.value)}
        />
      </div>
    ),
    SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="select-trigger" className={className}>
        {children}
      </div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span data-testid="select-value">{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div data-testid="select-content">{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; key?: string; value: string }) => (
      <div data-testid={`select-item-${value}`} data-value={value}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      overrideDefaults,
      as: _as,
      className,
    }: {
      children: React.ReactNode;
      overrideDefaults?: boolean;
      as?: React.ElementType;
      className?: string;
    }) => (
      <span data-testid="typography" data-override-defaults={overrideDefaults} className={className}>
        {children}
      </span>
    ),
  };
});

// --- Test Helpers ---

const createMockFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  icon: 'activity',
  tags: ['bitcoin', 'lightning'],
  domain_tags: [],
  reach: PubkyAppFeedReach.Following,
  sort: PubkyAppFeedSort.Popularity,
  content: PubkyAppPostKind.Short,
  layout: PubkyAppFeedLayout.Wide,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

const changeSelectValue = (testId: string, value: string | number) => {
  fireEvent.change(screen.getByTestId(`${testId}-hidden-input`), { target: { value: String(value) } });
};

// --- Unit Tests ---

describe('CustomFeedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
  });

  // -- Sanity / Rendering --

  it('renders in create mode with trigger child', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-trigger')).toBeInTheDocument();
    expect(within(screen.getByTestId('custom-feed-dialog-trigger')).getByText('Create Feed')).toBeInTheDocument();
  });

  it('supports controlled open without a trigger', () => {
    const onOpenChange = vi.fn();
    render(<CustomFeedDialog mode="edit" feed={createMockFeed()} open onOpenChange={onOpenChange} />);

    expect(screen.queryByTestId('custom-feed-dialog-trigger')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('dialog'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Controlled: the parent owns the open state, so it stays open until the
    // parent flips the prop.
    expect(screen.getByTestId('dialog')).toHaveAttribute('data-open', 'true');
  });

  it('shows a stored reach this dialog cannot offer as a disabled option', () => {
    // Followers has no home-store equivalent, so it is not an option — without
    // this the Select would fall back to its placeholder and read as unset.
    const feed = createMockFeed({ reach: PubkyAppFeedReach.Followers });

    render(<CustomFeedDialog mode="edit" feed={feed} open />);

    const unsupported = screen.getByText('Unsupported (set elsewhere)');
    expect(unsupported).toBeInTheDocument();
  });

  it('renders dialog title with translated title for create', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const title = screen.getByTestId('dialog-title');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('Create Feed');
  });

  it('renders dialog title with translated title for edit', () => {
    const mockFeed = createMockFeed();

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const title = screen.getByTestId('dialog-title');
    expect(title).toHaveTextContent('Edit Feed');
  });

  it('renders feed name input with placeholder', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Not your keys...');
  });

  it('renders the generic icon picker with the default feed icon', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('feed-icon-picker-trigger')).toHaveTextContent('Select icon');
    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute('data-value', 'activity');
    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute('data-title', 'Feed Icon');
    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute(
      'data-description',
      'Choose a custom icon for your new feed.',
    );
  });

  it('uses the selected icon when creating a feed', async () => {
    mockCommitCreate.mockResolvedValue(createMockFeed({ id: 'new-feed-123', icon: 'mountain' }));

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('choose-mountain-icon'));
    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Mountain Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'hiking' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: 'mountain',
        }),
      );
    });
  });

  it('renders feed name input as enabled in edit mode when customFeed is defined', () => {
    const mockFeed = createMockFeed();

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).not.toBeDisabled();
  });

  it('renders feed name input as enabled in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).not.toBeDisabled();
  });

  it('renders all filter section labels', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-filter-section')).toBeInTheDocument();
    expect(screen.getByTestId('sort-filter-section')).toBeInTheDocument();
    expect(screen.getByTestId('layout-filter-section')).toBeInTheDocument();
    expect(screen.getByTestId('content-filter-section')).toBeInTheDocument();
  });

  it('renders the post-tag input and hides profile tags until Tagged as is selected', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByText('Post Tags')).toBeInTheDocument();
    expect(screen.getByText('Filter by what posts are about.')).toBeInTheDocument();
    expect(screen.getByTestId('feed-tag-input')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-tags-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-profile-tag-input')).not.toBeInTheDocument();

    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);

    expect(screen.getByText('Profile Tags')).toBeInTheDocument();
    expect(screen.getByText('Filter by how people are tagged.')).toBeInTheDocument();
    expect(screen.getByTestId('profile-tags-section')).toBeInTheDocument();
    expect(screen.getByTestId('feed-profile-tag-input')).toBeInTheDocument();
  });

  it('renders Save Feed button', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const saveButton = screen.getByTestId('save-feed-button');
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toHaveTextContent('Save Feed');
    expect(saveButton.querySelector('.lucide-check')).toBeInTheDocument();
  });

  it('does not render Delete Feed button in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.queryByTestId('delete-feed-button')).not.toBeInTheDocument();
  });

  it('renders Delete Feed button in edit mode', () => {
    const mockFeed = createMockFeed();

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const deleteButton = screen.getByTestId('delete-feed-button');
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveTextContent('Delete Feed');
    expect(deleteButton.querySelector('.lucide-trash-2')).toBeInTheDocument();
  });

  it('renders Delete Feed before Save Feed in edit mode', () => {
    render(
      <CustomFeedDialog mode="edit" feed={createMockFeed()}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const actions = within(screen.getByTestId('dialog-footer')).getAllByRole('button');
    expect(actions).toEqual([screen.getByTestId('delete-feed-button'), screen.getByTestId('save-feed-button')]);
  });

  it('limits the dialog content to the xl width preset', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-content')).toHaveClass('w-xl');
  });

  // -- Trigger disabled state --

  it('does not disable dialog trigger in edit mode when customFeed is defined', () => {
    const mockFeed = createMockFeed();

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).not.toHaveAttribute('data-disabled', 'true');
  });

  it('does not disable dialog trigger in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).not.toHaveAttribute('data-disabled', 'true');
  });

  // -- Save button disabled state --

  it('disables Save Feed button when name is empty (create mode)', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('save-feed-button')).toBeDisabled();
  });

  it('disables Save Feed button when tags are empty (create mode)', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    // Type a name but don't add tags
    const input = screen.getByTestId('feed-name-input');
    fireEvent.change(input, { target: { value: 'My Feed' } });

    expect(screen.getByTestId('save-feed-button')).toBeDisabled();
  });

  it('requires a profile tag before saving an explicitly selected Tagged-as feed', async () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Tagged people' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });
    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);

    expect(screen.getByTestId('save-feed-button')).toBeDisabled();

    fireEvent.change(screen.getByTestId('profile-tag-input-field'), { target: { value: 'developer' } });

    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
  });

  // -- Name input interaction --

  it('updates name when typing in input', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    fireEvent.change(input, { target: { value: 'My New Feed' } });
    expect(input).toHaveValue('My New Feed');
  });

  // -- Tag management --

  it('adds a tag when tag input triggers onTagAdd', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const tagField = screen.getByTestId('tag-input-field');
    fireEvent.change(tagField, { target: { value: 'bitcoin' } });

    expect(screen.getByTestId('post-tag-bitcoin')).toBeInTheDocument();
  });

  it('removes a tag when PostTag close button is clicked', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    // Add a tag
    const tagField = screen.getByTestId('tag-input-field');
    fireEvent.change(tagField, { target: { value: 'bitcoin' } });
    expect(screen.getByTestId('post-tag-bitcoin')).toBeInTheDocument();

    // Remove it
    fireEvent.click(screen.getByTestId('remove-tag-bitcoin'));
    expect(screen.queryByTestId('post-tag-bitcoin')).not.toBeInTheDocument();
  });

  it('displays existing tags from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ tags: ['bitcoin', 'lightning'] });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('post-tag-bitcoin')).toBeInTheDocument();
    expect(screen.getByTestId('post-tag-lightning')).toBeInTheDocument();
  });

  it('hydrates existing profile tags from a Tagged-as feed in edit mode', () => {
    const mockFeed = createMockFeed({
      reach: PubkyAppFeedReach.Wot,
      tags: [],
      domain_tags: ['bitcoiner', '🔥'],
    });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', TAGGED_AS_FILTER_KEY);
    expect(screen.getByTestId('profile-tags-section')).toBeInTheDocument();
    expect(screen.getByTestId('post-tag-bitcoiner')).toBeInTheDocument();
    expect(screen.getByTestId('post-tag-🔥')).toBeInTheDocument();
  });

  it('shows legacy Me profile tags read-only while keeping the editor hidden', () => {
    const mockFeed = createMockFeed({
      reach: PubkyAppFeedReach.Me,
      tags: [],
      domain_tags: ['bitcoiner'],
    });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('profile-tags-section')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-profile-tag-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-tag-bitcoiner')).toHaveAttribute('data-show-close', 'false');
  });

  it('clears profile tags on every explicit non-Tagged-as selection', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);
    fireEvent.change(screen.getByTestId('profile-tag-input-field'), { target: { value: 'bitcoiner' } });
    expect(screen.getByTestId('post-tag-bitcoiner')).toBeInTheDocument();

    changeSelectValue('reach-select', PubkyAppFeedReach.Following);

    expect(screen.queryByTestId('profile-tags-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-profile-tag-input')).not.toBeInTheDocument();
  });

  it('caps profile tags at five and hides the emoji selector at the limit', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);
    const profileTagInput = screen.getByTestId('profile-tag-input-field');
    for (const tag of ['one', 'two', 'three', 'four', 'five', 'six']) {
      fireEvent.change(profileTagInput, { target: { value: tag } });
    }

    expect(screen.getByTestId('feed-profile-tag-input')).toHaveAttribute('data-current-tags-count', '5');
    expect(screen.getByTestId('feed-profile-tag-input')).toHaveAttribute('data-show-emoji-button', 'false');
    expect(screen.queryByTestId('post-tag-six')).not.toBeInTheDocument();
  });

  it('creates a profile-only Tagged-as feed as Wot plus domain tags', async () => {
    mockCommitCreate.mockResolvedValue(
      createMockFeed({ id: 'profile-feed', reach: PubkyAppFeedReach.Wot, tags: [], domain_tags: ['🔥'] }),
    );

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Emoji Network' } });
    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);
    fireEvent.change(screen.getByTestId('profile-tag-input-field'), { target: { value: '🔥' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Emoji Network',
          reach: PubkyAppFeedReach.Wot,
          tags: [],
          domain_tags: ['🔥'],
        }),
      );
    });
  });

  it('preserves a legacy Me domain feed during a rename-only edit', async () => {
    const mockFeed = createMockFeed({
      reach: PubkyAppFeedReach.Me,
      tags: ['bitcoin'],
      domain_tags: ['developer'],
    });
    mockCommitUpdate.mockResolvedValue({ ...mockFeed, name: 'Renamed legacy feed' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Renamed legacy feed' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith({
        feedId: mockFeed.id,
        changes: expect.objectContaining({
          name: 'Renamed legacy feed',
          reach: PubkyAppFeedReach.Me,
          domain_tags: ['developer'],
        }),
      });
    });
  });

  it('clears a legacy domain tag list on an explicit Following to Friends change', async () => {
    const mockFeed = createMockFeed({
      reach: PubkyAppFeedReach.Following,
      tags: ['bitcoin'],
      domain_tags: ['developer'],
    });
    mockCommitUpdate.mockResolvedValue({ ...mockFeed, reach: PubkyAppFeedReach.Friends, domain_tags: [] });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('reach-select', PubkyAppFeedReach.Friends);
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith({
        feedId: mockFeed.id,
        changes: expect.objectContaining({
          reach: PubkyAppFeedReach.Friends,
          domain_tags: [],
        }),
      });
    });
  });

  it('shows close buttons on tags when not disabled', () => {
    const mockFeed = createMockFeed({ tags: ['bitcoin'] });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('post-tag-bitcoin')).toHaveAttribute('data-show-close', 'true');
  });

  // -- Filter options rendering (scoped by section data-testid) --

  it('renders all reach filter options', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const reachSection = within(screen.getByTestId('reach-filter-section'));
    expect(reachSection.getAllByTestId(/^select-item-/).map((item) => item.getAttribute('data-value'))).toEqual([
      String(PubkyAppFeedReach.Wot),
      TAGGED_AS_FILTER_KEY,
      String(PubkyAppFeedReach.Following),
      String(PubkyAppFeedReach.Friends),
      String(PubkyAppFeedReach.Me),
      String(PubkyAppFeedReach.All),
    ]);
    expect(reachSection.getByTestId(`select-item-${PubkyAppFeedReach.Wot}`)).toHaveTextContent('My network');
    expect(reachSection.getByTestId(`select-item-${TAGGED_AS_FILTER_KEY}`)).toHaveTextContent('Tagged as');
  });

  it('renders all sort filter options', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const section = screen.getByTestId('sort-filter-section');
    expect(within(section).getByText('Recent')).toBeInTheDocument();
    expect(within(section).getByText('Popularity')).toBeInTheDocument();
  });

  it('renders all layout filter options', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const section = screen.getByTestId('layout-filter-section');
    expect(within(section).getByText('Columns')).toBeInTheDocument();
    expect(within(section).getByText('Wide')).toBeInTheDocument();
    expect(within(section).getByText('Visual')).toBeInTheDocument();
  });

  it('renders all content filter options', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const section = screen.getByTestId('content-filter-section');
    expect(within(section).getByText('All')).toBeInTheDocument();
    expect(within(section).getByText('Posts')).toBeInTheDocument();
    expect(within(section).getByText('Articles')).toBeInTheDocument();
    expect(within(section).getByText('Collections')).toBeInTheDocument();
    expect(within(section).getByText('Images')).toBeInTheDocument();
    expect(within(section).getByText('Videos')).toBeInTheDocument();
    expect(within(section).getByText('Links')).toBeInTheDocument();
    expect(within(section).getByText('Files')).toBeInTheDocument();
  });

  it('limits content filter options when layout is Visual', async () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('layout-select', PubkyAppFeedLayout.Visual);

    await waitFor(() => {
      const section = screen.getByTestId('content-filter-section');
      expect(within(section).getByText('All')).toBeInTheDocument();
      expect(within(section).getByText('Images')).toBeInTheDocument();
      expect(within(section).getByText('Videos')).toBeInTheDocument();
      expect(within(section).queryByText('Posts')).not.toBeInTheDocument();
      expect(within(section).queryByText('Articles')).not.toBeInTheDocument();
      expect(within(section).queryByText('Collections')).not.toBeInTheDocument();
      expect(within(section).queryByText('Links')).not.toBeInTheDocument();
      expect(within(section).queryByText('Files')).not.toBeInTheDocument();
    });
  });

  // -- Default select values in create mode --

  it('sets default reach to All in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', String(PubkyAppFeedReach.All));
  });

  it('sets default sort to Recent in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('sort-select')).toHaveAttribute('data-value', String(PubkyAppFeedSort.Recent));
  });

  it('sets default layout to Columns in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String(PubkyAppFeedLayout.Columns));
  });

  it('sets default content to ALL in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  it('coerces unsupported content to ALL when switching to Visual', async () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('content-select', PubkyAppPostKind.Short);
    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', String(PubkyAppPostKind.Short));

    changeSelectValue('layout-select', PubkyAppFeedLayout.Visual);

    await waitFor(() => {
      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
    });
  });

  it('does not restore unsupported content when leaving Visual', async () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('content-select', PubkyAppPostKind.Link);
    changeSelectValue('layout-select', PubkyAppFeedLayout.Visual);

    await waitFor(() => {
      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
    });

    changeSelectValue('layout-select', PubkyAppFeedLayout.Columns);

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  // -- Edit mode populates from customFeed --

  it('populates feed name input from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ name: 'Bitcoin News' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('feed-name-input')).toHaveValue('Bitcoin News');
  });

  it('uses an explicitly supplied feed when editing from another route', () => {
    const mockFeed = createMockFeed({ id: 'feed-explicit', name: 'Explicit Feed', icon: 'mountain' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('feed-name-input')).toHaveValue('Explicit Feed');
    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute('data-value', 'mountain');
    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute(
      'data-description',
      'Choose a custom icon for your feed.',
    );
    expect(screen.getByTestId('custom-feed-dialog-trigger')).not.toHaveAttribute('data-disabled', 'true');
  });

  it('falls back to the default icon for a legacy feed without an icon', () => {
    const mockFeed = createMockFeed({ icon: undefined });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute('data-value', 'activity');
  });

  it('populates reach select from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ reach: PubkyAppFeedReach.Friends });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', String(PubkyAppFeedReach.Friends));
  });

  it('maps null content from customFeed to ALL in edit mode', () => {
    const mockFeed = createMockFeed({ content: null });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  it('populates visual layout from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ layout: PubkyAppFeedLayout.Visual, content: PubkyAppPostKind.Video });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String(PubkyAppFeedLayout.Visual));
  });

  it('normalizes unsupported visual content from customFeed to ALL in edit mode', async () => {
    const mockFeed = createMockFeed({ layout: PubkyAppFeedLayout.Visual, content: PubkyAppPostKind.Short });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
    });
  });

  // -- Create feed flow --

  it('calls FeedController.commitCreate with correct params on save in create mode', async () => {
    const mockCreatedFeed = createMockFeed({ id: 'new-feed-123', name: 'My Feed' });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    // Fill in name
    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });

    // Add a tag
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });

    // Click save
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith({
        name: 'My Feed',
        icon: 'activity',
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        layout: PubkyAppFeedLayout.Columns,
        content: null, // ALL maps to null
        tags: ['bitcoin'],
        domain_tags: [],
      });
    });
  });

  it('shows success toast and navigates after successful create', async () => {
    const mockCreatedFeed = createMockFeed({ id: 'new-feed-123', name: 'My Feed' });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Feed created: My Feed',
      });
      expect(mockPush).toHaveBeenCalledWith('/feed/new-feed-123');
    });
  });

  it('shows error toast when create fails', async () => {
    mockCommitCreate.mockRejectedValue(new Error('Network error'));

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not create feed. Try again.',
      });
    });
  });

  it('passes content as null when content is ALL on create', async () => {
    const mockCreatedFeed = createMockFeed({ id: 'new-feed-123', name: 'My Feed' });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: null,
        }),
      );
    });
  });

  it('passes visual layout on create when selected', async () => {
    const mockCreatedFeed = createMockFeed({
      id: 'new-visual-feed-123',
      name: 'My Visual Feed',
      layout: PubkyAppFeedLayout.Visual,
      content: null,
    });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Visual Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'images' } });
    changeSelectValue('layout-select', PubkyAppFeedLayout.Visual);

    await waitFor(() => {
      expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String(PubkyAppFeedLayout.Visual));
    });

    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: PubkyAppFeedLayout.Visual,
          content: null,
        }),
      );
    });
  });

  // -- Edit feed flow --

  it('calls FeedController.commitUpdate with correct params on save in edit mode', async () => {
    const mockFeed = createMockFeed();

    const mockUpdatedFeed = createMockFeed({ id: 'feed-abc123', name: 'Bitcoin News' });
    mockCommitUpdate.mockResolvedValue(mockUpdatedFeed);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    // Add a new tag (existing tags are populated from customFeed)
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: {
          name: 'Bitcoin News',
          icon: 'activity',
          reach: PubkyAppFeedReach.Following,
          sort: PubkyAppFeedSort.Popularity,
          layout: PubkyAppFeedLayout.Wide,
          content: PubkyAppPostKind.Short,
          tags: ['bitcoin', 'lightning', 'crypto'],
          domain_tags: [],
        },
      });
    });
  });

  it('persists a newly selected icon when editing a feed', async () => {
    const mockFeed = createMockFeed({ icon: 'activity' });
    mockCommitUpdate.mockResolvedValue(createMockFeed({ icon: 'mountain' }));

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('choose-mountain-icon'));
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            icon: 'mountain',
          }),
        }),
      );
    });
  });

  it('shows success toast without navigating when the feed id is unchanged', async () => {
    const mockFeed = createMockFeed();

    const mockUpdatedFeed = createMockFeed({ id: 'feed-abc123', name: 'Bitcoin News' });
    mockCommitUpdate.mockResolvedValue(mockUpdatedFeed);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Feed updated: Bitcoin News',
      });
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('replaces the stale active route when an edit changes the feed id', async () => {
    const mockFeed = createMockFeed();
    mockCommitUpdate.mockResolvedValue(createMockFeed({ id: 'feed-updated' }));

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/feed/feed-updated');
    });
  });

  it('stays on the current route when editing an inactive explicitly supplied feed', async () => {
    const mockFeed = createMockFeed({ id: 'feed-inactive' });
    mockUsePathname.mockReturnValue('/home');
    mockCommitUpdate.mockResolvedValue(createMockFeed({ id: 'feed-updated' }));

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith(expect.objectContaining({ feedId: 'feed-inactive' }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('shows error toast when edit fails', async () => {
    const mockFeed = createMockFeed();
    mockCommitUpdate.mockRejectedValue(new Error('Network error'));

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not update feed. Try again.',
      });
    });
  });

  it('sends content kind value when content is not ALL on edit', async () => {
    const mockFeed = createMockFeed({ content: PubkyAppPostKind.Image });
    mockCommitUpdate.mockResolvedValue(createMockFeed());

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'photo' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            content: PubkyAppPostKind.Image,
          }),
        }),
      );
    });
  });

  // -- Delete feed flow --

  it('calls FeedController.commitDelete when delete button is clicked', async () => {
    const mockFeed = createMockFeed();
    mockCommitDelete.mockResolvedValue(undefined);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(mockCommitDelete).toHaveBeenCalledWith({ feedId: 'feed-abc123' });
    });
  });

  it('shows success toast and replaces the active route with home after successful delete', async () => {
    const mockFeed = createMockFeed();
    mockCommitDelete.mockResolvedValue(undefined);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Feed deleted: Bitcoin News',
      });
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('stays on the current route after deleting an inactive explicitly supplied feed', async () => {
    const mockFeed = createMockFeed({ id: 'feed-inactive' });
    mockUsePathname.mockReturnValue('/home');
    mockCommitDelete.mockResolvedValue(undefined);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(mockCommitDelete).toHaveBeenCalledWith({ feedId: 'feed-inactive' });
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('shows error toast when delete fails', async () => {
    const mockFeed = createMockFeed();
    mockCommitDelete.mockRejectedValue(new Error('Delete failed'));

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not delete feed. Try again.',
      });
    });
  });
});

// --- Snapshot Tests ---

describe('CustomFeedDialog - Snapshots', () => {
  // Warm the dialog's icons so DynamicLucideIcon renders them synchronously
  // and snapshots capture the resolved svg regardless of test order.
  beforeAll(async () => {
    requestLucideIcon('activity');
    await vi.waitFor(() => {
      if (getLucideIconState('activity')?.status !== 'loaded') throw new Error('icon not cached yet');
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
  });

  it('matches snapshot for create mode default state', () => {
    const { container } = render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit mode with custom feed', () => {
    const mockFeed = createMockFeed();

    const { container } = render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit mode with null content feed', () => {
    const mockFeed = createMockFeed({ content: null, tags: ['bitcoin'] });

    const { container } = render(
      <CustomFeedDialog mode="edit" feed={mockFeed}>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for create mode with different trigger child', () => {
    const { container } = render(
      <CustomFeedDialog mode="create">
        <span className="custom-trigger">+ New Feed</span>
      </CustomFeedDialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
