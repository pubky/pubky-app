import { type ReactElement } from 'react';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { ResourceController } from '@/controllers/resource/resource';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
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
      <div
        data-testid="dialog"
        data-open={open}
        onClick={(event) => {
          if (
            event.target === event.currentTarget ||
            (event.target as HTMLElement).closest('[data-testid="custom-feed-dialog-trigger"]')
          )
            onOpenChange?.(!open);
        }}
      >
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
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

// Mock toast
vi.mock('@/molecules/Toaster/toast');

// The saved services' names: Pinakes' host facet of a search on them
const resourceSearch = vi.hoisted(() => ({
  hostFacets: null as { host: string; site: string; count: number }[] | null,
  loading: false,
  queries: [] as unknown[],
}));
vi.mock('@/hooks/useResourceSearch/useResourceSearch', () => ({
  useResourceSearch: (query: unknown) => {
    resourceSearch.queries.push(query);
    return { hostFacets: query ? resourceSearch.hostFacets : null, loading: !!query && resourceSearch.loading };
  },
}));
beforeEach(() => {
  resourceSearch.hostFacets = null;
  resourceSearch.loading = false;
  resourceSearch.queries = [];
});

// Whether the configured Pinakes serves My network (`wot_2`)
const reachSet = vi.hoisted(() => ({ served: false }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesReachSetServed: () => reachSet.served,
}));
beforeEach(() => {
  reachSet.served = false;
});

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
    SelectItem: ({
      children,
      value,
      disabled,
    }: {
      children: React.ReactNode;
      key?: string;
      value: string;
      disabled?: boolean;
    }) => (
      <div data-testid={`select-item-${value}`} data-value={value} data-disabled={disabled}>
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

/**
 * The dialog renders a tooltip next to its Layout heading, and Radix requires a
 * provider above any tooltip, so every render in this file is wrapped in one.
 */
const render = (ui: ReactElement) => rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

const createMockFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  icon: 'activity',
  tags: ['bitcoin', 'lightning'],
  domain_tags: [],
  reach: 'following',
  sort: 'popularity',
  content: 'note',
  layout: 'wide',
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
    useAuthStore.setState({
      ...authInitialState,
      currentUserPubky: 'test-user',
      session: mockSession(),
      restoreStatus: 'ready',
    });
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
  });

  // -- Sanity / Rendering --

  it('renders in create mode with trigger child', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
    const feed = createMockFeed({ reach: 'followers' });

    render(<CustomFeedDialog mode="edit" feed={feed} open />);

    const unsupported = screen.getByText('Unsupported (set elsewhere)');
    expect(unsupported).toBeInTheDocument();
  });

  it('renders dialog title with translated title for create', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const title = screen.getByTestId('dialog-title');
    expect(title).toHaveTextContent('Edit Feed');
  });

  it('renders feed name input with placeholder', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Name your feed');
  });

  it('renders the generic icon picker with the default feed icon', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).not.toBeDisabled();
  });

  it('renders feed name input as enabled in create mode', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).not.toBeDisabled();
  });

  it('renders all filter section labels', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.queryByTestId('delete-feed-button')).not.toBeInTheDocument();
  });

  it('renders Delete Feed button in edit mode', () => {
    const mockFeed = createMockFeed();

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="edit" feed={createMockFeed()} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const actions = within(screen.getByTestId('dialog-footer')).getAllByRole('button');
    expect(actions).toEqual([screen.getByTestId('delete-feed-button'), screen.getByTestId('save-feed-button')]);
  });

  it('limits the dialog content to the xl width preset', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-content')).toHaveClass('w-xl');
  });

  // -- Trigger disabled state --

  it('does not disable dialog trigger in edit mode when customFeed is defined', () => {
    const mockFeed = createMockFeed();

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).not.toHaveAttribute('data-disabled', 'true');
  });

  it('does not disable dialog trigger in create mode', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).not.toHaveAttribute('data-disabled', 'true');
  });

  // -- Save button disabled state --

  it('disables Save Feed button when name is empty (create mode)', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('save-feed-button')).toBeDisabled();
  });

  it('disables Save Feed button when tags are empty (create mode)', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const tagField = screen.getByTestId('tag-input-field');
    fireEvent.change(tagField, { target: { value: 'bitcoin' } });

    expect(screen.getByTestId('post-tag-bitcoin')).toBeInTheDocument();
  });

  it('removes a tag when PostTag close button is clicked', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('post-tag-bitcoin')).toBeInTheDocument();
    expect(screen.getByTestId('post-tag-lightning')).toBeInTheDocument();
  });

  it('hydrates existing profile tags from a Tagged-as feed in edit mode', () => {
    const mockFeed = createMockFeed({
      reach: 'wot',
      tags: [],
      domain_tags: ['bitcoiner', '🔥'],
    });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      reach: 'me',
      tags: [],
      domain_tags: ['bitcoiner'],
    });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('profile-tags-section')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-profile-tag-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-tag-bitcoiner')).toHaveAttribute('data-show-close', 'false');
  });

  it('clears profile tags on every explicit non-Tagged-as selection', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);
    fireEvent.change(screen.getByTestId('profile-tag-input-field'), { target: { value: 'bitcoiner' } });
    expect(screen.getByTestId('post-tag-bitcoiner')).toBeInTheDocument();

    changeSelectValue('reach-select', 'following');

    expect(screen.queryByTestId('profile-tags-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-profile-tag-input')).not.toBeInTheDocument();
  });

  // The input is mocked here, so this is the dialog's own fold of the label the input hands over (a clicked
  // suggestion arrives as stored); the typed draft is folded by `useTagInput` and is not under test.
  it('folds a handed-over profile tag as the data model stores it: a non-ASCII capital kept, ASCII case deduped', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('reach-select', TAGGED_AS_FILTER_KEY);
    fireEvent.change(screen.getByTestId('profile-tag-input-field'), { target: { value: 'Äpfel' } });
    fireEvent.change(screen.getByTestId('profile-tag-input-field'), { target: { value: 'ÄPFEL' } });

    expect(screen.getByTestId('post-tag-Äpfel')).toBeInTheDocument();
    expect(screen.queryByTestId('post-tag-äpfel')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-profile-tag-input')).toHaveAttribute('data-current-tags-count', '1');
  });

  it('caps profile tags at five and hides the emoji selector at the limit', () => {
    render(
      <CustomFeedDialog mode="create" open>
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
      createMockFeed({ id: 'profile-feed', reach: 'wot', tags: [], domain_tags: ['🔥'] }),
    );

    render(
      <CustomFeedDialog mode="create" open>
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
          reach: 'wot',
          tags: [],
          domain_tags: ['🔥'],
        }),
      );
    });
  });

  it('preserves a legacy Me domain feed during a rename-only edit', async () => {
    const mockFeed = createMockFeed({
      reach: 'me',
      tags: ['bitcoin'],
      domain_tags: ['developer'],
    });
    mockCommitUpdate.mockResolvedValue({ ...mockFeed, name: 'Renamed legacy feed' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
          reach: 'me',
          domain_tags: ['developer'],
        }),
      });
    });
  });

  it('clears a legacy domain tag list on an explicit Following to Friends change', async () => {
    const mockFeed = createMockFeed({
      reach: 'following',
      tags: ['bitcoin'],
      domain_tags: ['developer'],
    });
    mockCommitUpdate.mockResolvedValue({ ...mockFeed, reach: 'friends', domain_tags: [] });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('reach-select', 'friends');
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith({
        feedId: mockFeed.id,
        changes: expect.objectContaining({
          reach: 'friends',
          domain_tags: [],
        }),
      });
    });
  });

  it('shows close buttons on tags when not disabled', () => {
    const mockFeed = createMockFeed({ tags: ['bitcoin'] });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('post-tag-bitcoin')).toHaveAttribute('data-show-close', 'true');
  });

  // -- Filter options rendering (scoped by section data-testid) --

  it('renders all reach filter options', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const reachSection = within(screen.getByTestId('reach-filter-section'));
    expect(reachSection.getAllByTestId(/^select-item-/).map((item) => item.getAttribute('data-value'))).toEqual([
      String('wot'),
      TAGGED_AS_FILTER_KEY,
      String('following'),
      String('friends'),
      String('me'),
      String('all'),
    ]);
    expect(reachSection.getByTestId(`select-item-${'wot'}`)).toHaveTextContent('My network');
    expect(reachSection.getByTestId(`select-item-${TAGGED_AS_FILTER_KEY}`)).toHaveTextContent('Tagged as');
  });

  it('renders all sort filter options', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const section = screen.getByTestId('sort-filter-section');
    expect(within(section).getByText('Recent')).toBeInTheDocument();
    expect(within(section).getByText('Popularity')).toBeInTheDocument();
  });

  it('renders all layout filter options', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const section = screen.getByTestId('layout-filter-section');
    expect(within(section).getByText('Columns')).toBeInTheDocument();
    expect(within(section).getByText('Wide')).toBeInTheDocument();
    expect(within(section).getByText('Visual')).toBeInTheDocument();
  });

  it('keeps the layout section visible with the responsive layout hint collapsed', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const section = screen.getByTestId('layout-filter-section');

    expect(within(section).getByText('Layout')).toBeInTheDocument();
    expect(within(section).getByTestId('layout-select')).toBeInTheDocument();
    expect(screen.getByTestId('layout-tooltip-trigger')).toHaveAccessibleName('About layout settings');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the responsive layout hint when the layout info affordance is hovered', async () => {
    const user = userEvent.setup();

    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    await user.hover(screen.getByTestId('layout-tooltip-trigger'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Cards also applies on mobile. Other layouts use a single column on mobile.',
      );
    });
  });

  it.each([true, false])('keeps a completed touch tap usable (synthesized click: %s)', async (synthesizeClick) => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    const trigger = screen.getByTestId('layout-tooltip-trigger');

    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.pointerUp(trigger, { pointerType: 'touch' });
    if (synthesizeClick) fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Cards also applies on mobile. Other layouts use a single column on mobile.',
      );
    });

    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.pointerUp(trigger, { pointerType: 'touch' });
    if (synthesizeClick) fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  it('renders all content filter options', () => {
    render(
      <CustomFeedDialog mode="create" open>
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

  describe('External resources', () => {
    it('offers External resources as a content choice', () => {
      render(<CustomFeedDialog mode="create" open />);

      const section = screen.getByTestId('content-filter-section');
      expect(within(section).getByText('External resources')).toBeInTheDocument();
    });

    it('moves a Me reach to All and leaves out the reaches and layout the resource search has none for', async () => {
      render(<CustomFeedDialog mode="create" open />);
      changeSelectValue('reach-select', 'me');
      changeSelectValue('sort-select', 'popularity');

      changeSelectValue('content-select', 'RESOURCES');

      await waitFor(() => expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', 'all'));
      // Popularity is served (Pinakes' activity rank)
      expect(screen.getByTestId('sort-select')).toHaveAttribute('data-value', 'popularity');
      const reach = screen.getByTestId('reach-filter-section');
      for (const value of ['all', 'following', 'friends']) {
        expect(within(reach).getByTestId(`select-item-${value}`)).not.toHaveAttribute('data-disabled', 'true');
      }
      for (const value of ['wot', TAGGED_AS_FILTER_KEY, 'me']) {
        expect(within(reach).queryByTestId(`select-item-${value}`)).not.toBeInTheDocument();
      }
      const sort = screen.getByTestId('sort-filter-section');
      expect(within(sort).getByTestId('select-item-popularity')).not.toHaveAttribute('data-disabled', 'true');
      // Resource cards have no Visual tiles
      expect(
        within(screen.getByTestId('layout-filter-section')).queryByTestId('select-item-visual'),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId('layout-filter-section')).getByTestId('select-item-columns'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/have no My network/)).not.toBeInTheDocument();
    });

    it('keeps a network reach when External resources is chosen, and offers every kind and its sub-kinds', async () => {
      render(<CustomFeedDialog mode="create" open />);
      expect(screen.queryByTestId('resource-type-section')).not.toBeInTheDocument();
      changeSelectValue('reach-select', 'following');

      changeSelectValue('content-select', 'RESOURCES');

      await waitFor(() => expect(screen.getByTestId('resource-type-section')).toBeInTheDocument());
      expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', 'following');
      const type = screen.getByTestId('resource-type-section');
      expect(within(type).getByTestId('select-item-all')).toHaveTextContent('All types');
      // Each kind of the search, its types as the feed stores them (sorted), then its sub-kinds
      for (const [value, label] of [
        ['MusicGroup,MusicPlaylist,MusicRecording', 'Music'],
        ['MusicRecording', 'Songs'],
        ['MusicAlbum', 'Albums'],
        ['Event', 'Events'],
        ['Place', 'Places'],
        ['Restaurant', 'Restaurants'],
        ['Report,ScholarlyArticle', 'Papers & reports'],
        ['Recipe', 'Recipes'],
        ['JobPosting', 'Jobs'],
        ['Product', 'Products'],
      ]) {
        expect(within(type).getByTestId(`select-item-${value}`)).toHaveTextContent(label);
      }
      // A sub-kind tells a screen reader which kind it belongs to; a kind needs no such text
      expect(within(type).getByTestId('select-item-MusicRecording')).toHaveTextContent('Songs, in Music');
      expect(within(type).getByTestId('select-item-Restaurant')).toHaveTextContent('Restaurants, in Places');
      expect(within(screen.getByTestId('select-item-Place')).queryByText(/, in /)).not.toBeInTheDocument();
    });

    it('shows each Type with its kind’s icon, as the Kind filter does', () => {
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({ target: 'resources', resource_types: ['Restaurant', 'BarOrPub'], content: null })}
        />,
      );
      const icon = (value: string) =>
        within(screen.getByTestId('resource-type-section')).getByTestId(`select-item-${value}`).querySelector('svg');
      // All types: the Kind filter's All kinds icon
      expect(icon('all')).toHaveClass('lucide-layout-grid');
      expect(icon('MusicGroup,MusicPlaylist,MusicRecording')).toHaveClass('lucide-music');
      // A sub-kind: its kind's icon
      expect(icon('MusicRecording')).toHaveClass('lucide-music');
      expect(icon('Restaurant')).toHaveClass('lucide-map-pin');
      expect(icon('Event')).toHaveClass('lucide-calendar-days');
      // Types no option stands for: the Kind filter's icon for a kind it has none for
      expect(icon('BarOrPub,Restaurant')).toHaveClass('lucide-shapes');
    });

    it('labels the tag field for resources, not posts', async () => {
      render(<CustomFeedDialog mode="create" open />);
      expect(screen.getByText('Post Tags')).toBeInTheDocument();

      changeSelectValue('content-select', 'RESOURCES');

      await waitFor(() => expect(screen.queryByText('Post Tags')).not.toBeInTheDocument());
      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(screen.getByText('Filter by what external resources are tagged with.')).toBeInTheDocument();
    });

    it('creates a feed of external resources', async () => {
      mockCommitCreate.mockResolvedValue(createMockFeed({ id: 'new-feed-123', name: 'Music' }));
      render(<CustomFeedDialog mode="create" open />);
      fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Music' } });
      fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'music' } });
      changeSelectValue('content-select', 'RESOURCES');
      await waitFor(() => expect(screen.getByTestId('resource-type-section')).toBeInTheDocument());
      changeSelectValue('resource-type-select', 'MusicRecording');

      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));

      await waitFor(() =>
        expect(mockCommitCreate).toHaveBeenCalledWith({
          name: 'Music',
          icon: 'activity',
          reach: 'all',
          sort: 'recent',
          layout: 'columns',
          content: null,
          target: 'resources',
          resource_types: ['MusicRecording'],
          resource_filters: null,
          tags: ['music'],
          domain_tags: [],
        }),
      );
    });

    it('keeps a Visual layout another client stored on a feed of external resources', async () => {
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({ target: 'resources', content: null, reach: 'all', sort: 'recent', layout: 'visual' })}
        />,
      );

      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'RESOURCES');
      expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', 'visual');
      // The stored Visual stays listed, so the Select reads what the feed holds
      expect(within(screen.getByTestId('layout-filter-section')).getByTestId('select-item-visual')).toBeInTheDocument();
      expect(within(screen.getByTestId('content-filter-section')).getByText('External resources')).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Renamed' } });
      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));

      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith({
          feedId: 'feed-abc123',
          changes: expect.objectContaining({ name: 'Renamed', layout: 'visual', target: 'resources', content: null }),
        }),
      );
    });

    it('reads a stored reach a feed of external resources has no counterpart for as All, with no note', async () => {
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({ target: 'resources', content: null, reach: 'wot', sort: 'recent', layout: 'columns' })}
        />,
      );

      await waitFor(() => expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', 'all'));
      expect(
        within(screen.getByTestId('reach-filter-section')).queryByTestId('select-item-wot'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/have no My network/)).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));
      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ changes: expect.objectContaining({ reach: 'all', target: 'resources' }) }),
        ),
      );
    });

    it('keeps and lists My network on a feed of external resources where Pinakes serves it', async () => {
      reachSet.served = true;
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({ target: 'resources', content: null, reach: 'wot', sort: 'recent', layout: 'columns' })}
        />,
      );

      const reachSection = within(screen.getByTestId('reach-filter-section'));
      expect(reachSection.getByTestId('select-item-wot')).toHaveTextContent('My network');
      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', 'wot');
      fireEvent.click(screen.getByTestId('save-feed-button'));
      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ changes: expect.objectContaining({ reach: 'wot', target: 'resources' }) }),
        ),
      );
    });

    it('drops profile tags another client stored on a feed of external resources, so it saves', async () => {
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({
            target: 'resources',
            content: null,
            reach: 'wot',
            domain_tags: ['dev'],
            sort: 'recent',
            layout: 'columns',
          })}
        />,
      );

      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));
      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ changes: expect.objectContaining({ reach: 'all', domain_tags: [] }) }),
        ),
      );
    });

    it('offers no Visual layout for a new feed of external resources', async () => {
      render(<CustomFeedDialog mode="create" open />);

      changeSelectValue('content-select', 'RESOURCES');

      await waitFor(() =>
        expect(
          within(screen.getByTestId('layout-filter-section')).queryByTestId('select-item-visual'),
        ).not.toBeInTheDocument(),
      );
    });

    it('creates a feed of a whole kind with every type of the kind', async () => {
      mockCommitCreate.mockResolvedValue(createMockFeed({ id: 'new-feed-123', name: 'Music' }));
      render(<CustomFeedDialog mode="create" open />);
      fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Music' } });
      fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'music' } });
      changeSelectValue('content-select', 'RESOURCES');
      await waitFor(() => expect(screen.getByTestId('resource-type-section')).toBeInTheDocument());
      changeSelectValue('resource-type-select', 'MusicGroup,MusicPlaylist,MusicRecording');

      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));

      await waitFor(() =>
        expect(mockCommitCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            target: 'resources',
            resource_types: ['MusicGroup', 'MusicPlaylist', 'MusicRecording'],
          }),
        ),
      );
    });

    it('keeps the types another client saved that no option stands for', async () => {
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({ target: 'resources', resource_types: ['Restaurant', 'BarOrPub'], content: null })}
        />,
      );

      expect(screen.getByTestId('resource-type-select')).toHaveAttribute('data-value', 'BarOrPub,Restaurant');
      expect(
        within(screen.getByTestId('resource-type-section')).getByTestId('select-item-BarOrPub,Restaurant'),
      ).toHaveTextContent('Bars, Restaurants');
      fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Renamed' } });
      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));

      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith({
          feedId: 'feed-abc123',
          changes: expect.objectContaining({ name: 'Renamed', resource_types: ['BarOrPub', 'Restaurant'] }),
        }),
      );
    });

    it('lists the saved filters as plain rows, removes one, and drops a kind’s own with another Type', async () => {
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({
            target: 'resources',
            resource_types: ['Event'],
            resource_filters: { when: 'week', near: '47.37,8.54', place: 'Zürich', rows: 'links' },
            content: null,
          })}
        />,
      );

      const rows = screen.getByTestId('resource-filter-rows');
      expect(within(rows).getByTestId('resource-filter-row-when')).toHaveTextContent('When: This week');
      expect(within(rows).getByTestId('resource-filter-row-near')).toHaveTextContent('Where: Zürich · Within 10 km');
      // Plain rows, not tags
      expect(within(rows).queryByTestId(/readonly-tag/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('resource-filter-row-rows'));
      // Places have Where, not When
      changeSelectValue('resource-type-select', 'Place');
      await waitFor(() => expect(screen.queryByTestId('resource-filter-row-when')).not.toBeInTheDocument());
      expect(screen.getByTestId('resource-filter-row-near')).toBeInTheDocument();

      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));
      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith({
          feedId: 'feed-abc123',
          changes: expect.objectContaining({
            resource_types: ['Place'],
            resource_filters: { near: '47.37,8.54', place: 'Zürich' },
          }),
        }),
      );
    });

    it('names the saved services, read with them from Pinakes while the dialog is open', () => {
      resourceSearch.hostFacets = [
        { host: 'music.amazon.co.uk', site: 'Amazon Music', count: 1 },
        { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
        { host: 'open.spotify.com', site: 'Spotify', count: 27 },
      ];
      const hosts = ['music.amazon.co.uk', 'music.amazon.com', 'open.spotify.com'];
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({
            target: 'resources',
            resource_types: ['MusicGroup', 'MusicPlaylist', 'MusicRecording'],
            resource_filters: { host: hosts.join(',') },
            content: null,
          })}
        />,
      );

      expect(screen.getByTestId('resource-filter-row-host')).toHaveTextContent('Service: Amazon Music, Spotify');
      expect(resourceSearch.queries).toContainEqual(expect.objectContaining({ hosts, extraFacets: ['host'] }));
    });

    it('shows the Service row loading, never its hosts, until the names are read, and the hosts once it failed', () => {
      resourceSearch.loading = true;
      const feed = createMockFeed({
        target: 'resources',
        resource_types: ['MusicGroup', 'MusicPlaylist', 'MusicRecording'],
        resource_filters: { host: 'music.amazon.com,open.spotify.com' },
        content: null,
      });
      const { rerender } = render(<CustomFeedDialog mode="edit" open feed={feed} />);

      const row = screen.getByTestId('resource-filter-row-host');
      expect(row.textContent).toBe('Service:');
      expect(row).toHaveAccessibleName('Remove Service: (loading)');
      expect(within(row).getByTestId('removable-row-skeleton')).toBeInTheDocument();

      // The read failed: a host reads as itself
      resourceSearch.loading = false;
      rerender(
        <TooltipProvider delayDuration={0}>
          <CustomFeedDialog mode="edit" open feed={feed} />
        </TooltipProvider>,
      );
      expect(screen.getByTestId('resource-filter-row-host')).toHaveTextContent(
        'Service: music.amazon.com, open.spotify.com',
      );
      expect(screen.queryByTestId('removable-row-skeleton')).not.toBeInTheDocument();
    });

    it('keeps the names the last read gave while they are read again', () => {
      resourceSearch.hostFacets = [
        { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
        { host: 'open.spotify.com', site: 'Spotify', count: 27 },
      ];
      const feed = createMockFeed({
        target: 'resources',
        resource_types: ['MusicGroup', 'MusicPlaylist', 'MusicRecording'],
        resource_filters: { host: 'music.amazon.com,open.spotify.com' },
        content: null,
      });
      const dialog = (open: boolean) => (
        <TooltipProvider delayDuration={0}>
          <CustomFeedDialog mode="edit" open={open} feed={feed} />
        </TooltipProvider>
      );
      const { rerender } = render(<CustomFeedDialog mode="edit" open feed={feed} />);
      expect(screen.getByTestId('resource-filter-row-host')).toHaveTextContent('Service: Amazon Music, Spotify');

      // The names are read again (closed and opened while mounted, as the Create Feed dialog stays)
      rerender(dialog(false));
      resourceSearch.hostFacets = null;
      resourceSearch.loading = true;
      rerender(dialog(true));
      const row = screen.getByTestId('resource-filter-row-host');
      expect(row).toHaveTextContent('Service: Amazon Music, Spotify');
      expect(within(row).queryByTestId('removable-row-skeleton')).not.toBeInTheDocument();
    });

    it('names the saved services at once when the Edit dialog opens again, from the last read’s cache', () => {
      const FACETS = [
        { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
        { host: 'open.spotify.com', site: 'Spotify', count: 27 },
      ];
      resourceSearch.hostFacets = FACETS;
      const feed = createMockFeed({
        target: 'resources',
        resource_types: ['MusicGroup', 'MusicPlaylist', 'MusicRecording'],
        resource_filters: { host: 'music.amazon.com,open.spotify.com' },
        content: null,
      });
      const { unmount } = render(<CustomFeedDialog mode="edit" open feed={feed} />);
      expect(screen.getByTestId('resource-filter-row-host')).toHaveTextContent('Service: Amazon Music, Spotify');
      unmount();

      // Opened again: a new dialog whose read is on its way, while Pinakes' answer is still cached
      resourceSearch.hostFacets = null;
      resourceSearch.loading = true;
      const cached = vi.spyOn(ResourceController, 'getCachedHostFacets').mockReturnValue(FACETS);
      try {
        render(<CustomFeedDialog mode="edit" open feed={feed} />);
        const row = screen.getByTestId('resource-filter-row-host');
        expect(row).toHaveTextContent('Service: Amazon Music, Spotify');
        expect(row).not.toHaveAttribute('aria-busy');
        expect(within(row).queryByTestId('removable-row-skeleton')).not.toBeInTheDocument();
        expect(cached).toHaveBeenCalledWith(
          expect.objectContaining({ hosts: ['music.amazon.com', 'open.spotify.com'], extraFacets: ['host'] }),
          1,
        );
      } finally {
        cached.mockRestore();
      }
    });

    it('names the services the cache knows and loads the others, without a comma in its name', () => {
      resourceSearch.loading = true;
      const cached = vi
        .spyOn(ResourceController, 'getCachedHostFacets')
        .mockReturnValue([{ host: 'music.amazon.com', site: 'Amazon Music', count: 1 }]);
      try {
        const feed = createMockFeed({
          target: 'resources',
          resource_types: ['MusicRecording'],
          resource_filters: { host: 'music.amazon.com,open.spotify.com' },
          content: null,
        });
        render(<CustomFeedDialog mode="edit" open feed={feed} />);

        const row = screen.getByTestId('resource-filter-row-host');
        expect(row.textContent).toBe('Service: Amazon Music,');
        expect(row).toHaveAccessibleName('Remove Service: Amazon Music (loading)');
        expect(within(row).getByTestId('removable-row-skeleton')).toBeInTheDocument();
      } finally {
        cached.mockRestore();
      }
    });

    it('reads no service names while closed, or for a feed without saved services', () => {
      const saved = createMockFeed({
        target: 'resources',
        resource_types: ['MusicRecording'],
        resource_filters: { host: 'open.spotify.com' },
        content: null,
      });
      const { unmount } = render(<CustomFeedDialog mode="edit" open={false} feed={saved} />);
      unmount();
      const unsaved = createMockFeed({
        target: 'resources',
        resource_types: ['MusicRecording'],
        resource_filters: { when: 'week' },
        content: null,
      });
      render(<CustomFeedDialog mode="edit" open feed={unsaved} />);

      expect(resourceSearch.queries.length).toBeGreaterThan(0);
      expect(resourceSearch.queries.every((query) => query === null)).toBe(true);
    });

    it('keeps a feed of the type named ALL, which is no "every type"', async () => {
      mockCommitUpdate.mockResolvedValue(createMockFeed());
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({ target: 'resources', resource_types: ['ALL'], content: null })}
        />,
      );

      expect(screen.getByTestId('resource-type-select')).toHaveAttribute('data-value', 'ALL');
      fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Renamed' } });
      await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));

      await waitFor(() =>
        expect(mockCommitUpdate).toHaveBeenCalledWith({
          feedId: 'feed-abc123',
          changes: expect.objectContaining({ resource_types: ['ALL'] }),
        }),
      );
    });

    it('reopens a feed of external resources as such, keeping its layout', () => {
      render(
        <CustomFeedDialog
          mode="edit"
          open
          feed={createMockFeed({
            target: 'resources',
            resource_types: ['Book'],
            content: null,
            reach: 'all',
            sort: 'recent',
            layout: 'cards',
          })}
        />,
      );

      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'RESOURCES');
      expect(screen.getByTestId('resource-type-select')).toHaveAttribute('data-value', 'Book');
      expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', 'cards');
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });
  });

  it('limits content filter options when layout is Visual', async () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('layout-select', 'visual');

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

  it('offers Cards with all content types and preserves the selected content', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );
    expect(within(screen.getByTestId('layout-select')).getByText('Cards')).toBeInTheDocument();
    changeSelectValue('content-select', 'article');
    changeSelectValue('layout-select', 'cards');

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'article');
    for (const label of ['All', 'Posts', 'Articles', 'Collections', 'Images', 'Videos', 'Links', 'Files']) {
      expect(within(screen.getByTestId('content-filter-section')).getByText(label)).toBeInTheDocument();
    }
  });

  it('loads a saved Cards feed for editing', () => {
    render(<CustomFeedDialog mode="edit" feed={createMockFeed({ layout: 'cards' })} open />);
    expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', 'cards');
  });

  // -- Default select values in create mode --

  it('sets default reach to All in create mode', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', String('all'));
  });

  it('sets default sort to Recent in create mode', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('sort-select')).toHaveAttribute('data-value', String('recent'));
  });

  it('sets default layout to Columns in create mode', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String('columns'));
  });

  it('sets default content to ALL in create mode', () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  it('coerces unsupported content to ALL when switching to Visual', async () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('content-select', 'note');
    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', String('note'));

    changeSelectValue('layout-select', 'visual');

    await waitFor(() => {
      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
    });
  });

  it('does not restore unsupported content when leaving Visual', async () => {
    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('content-select', 'link');
    changeSelectValue('layout-select', 'visual');

    await waitFor(() => {
      expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
    });

    changeSelectValue('layout-select', 'columns');

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  // -- Edit mode populates from customFeed --

  it('populates feed name input from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ name: 'Bitcoin News' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('feed-name-input')).toHaveValue('Bitcoin News');
  });

  it('uses an explicitly supplied feed when editing from another route', () => {
    const mockFeed = createMockFeed({ id: 'feed-explicit', name: 'Explicit Feed', icon: 'mountain' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('icon-picker-dialog')).toHaveAttribute('data-value', 'activity');
  });

  it('populates reach select from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ reach: 'friends' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', String('friends'));
  });

  it('maps null content from customFeed to ALL in edit mode', () => {
    const mockFeed = createMockFeed({ content: null });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  it('populates visual layout from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ layout: 'visual', content: 'video' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String('visual'));
  });

  it('normalizes unsupported visual content from customFeed to ALL in edit mode', async () => {
    const mockFeed = createMockFeed({ layout: 'visual', content: 'note' });

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="create" open>
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
        reach: 'all',
        sort: 'recent',
        layout: 'columns',
        content: null, // ALL maps to null
        target: 'posts',
        resource_types: null,
        resource_filters: null,
        tags: ['bitcoin'],
        domain_tags: [],
      });
    });
  });

  it('shows success toast and navigates after successful create', async () => {
    const mockCreatedFeed = createMockFeed({ id: 'new-feed-123', name: 'My Feed' });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        title: 'Feed created',
      });
      expect(mockPush).toHaveBeenCalledWith('/feed/new-feed-123');
    });
  });

  it('shows error toast when create fails', async () => {
    mockCommitCreate.mockRejectedValue(new Error('Network error'));

    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'bitcoin' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not create feed. Try again.',
      });
    });
  });

  it('passes content as null when content is ALL on create', async () => {
    const mockCreatedFeed = createMockFeed({ id: 'new-feed-123', name: 'My Feed' });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create" open>
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

  it.each(['visual', 'cards'] as const)('passes layout %s on create when selected', async (layout) => {
    const mockCreatedFeed = createMockFeed({
      id: 'new-feed-123',
      name: 'My Feed',
      layout,
      content: null,
    });
    mockCommitCreate.mockResolvedValue(mockCreatedFeed);

    render(
      <CustomFeedDialog mode="create" open>
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My Feed' } });
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'images' } });
    changeSelectValue('layout-select', layout);

    await waitFor(() => {
      expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String(layout));
    });

    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          layout,
          content: null,
        }),
      );
    });
  });

  // -- Edit feed flow --

  it.each(['wide', 'cards'] as const)('saves layout %s when editing an existing feed', async (layout) => {
    const mockFeed = createMockFeed();

    const mockUpdatedFeed = createMockFeed({ id: 'feed-abc123', name: 'Bitcoin News' });
    mockCommitUpdate.mockResolvedValue(mockUpdatedFeed);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    changeSelectValue('layout-select', layout);

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
          reach: 'following',
          sort: 'popularity',
          layout,
          content: 'note',
          target: 'posts',
          resource_types: null,
          resource_filters: null,
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        title: 'Feed updated',
      });
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('replaces the stale active route when an edit changes the feed id', async () => {
    const mockFeed = createMockFeed();
    mockCommitUpdate.mockResolvedValue(createMockFeed({ id: 'feed-updated' }));

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not update feed. Try again.',
      });
    });
  });

  it('sends content kind value when content is not ALL on edit', async () => {
    const mockFeed = createMockFeed({ content: 'image' });
    mockCommitUpdate.mockResolvedValue(createMockFeed());

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
            content: 'image',
          }),
        }),
      );
    });
  });

  // -- Delete feed flow --

  it('calls FeedController.commitDelete when delete button is clicked', async () => {
    const mockFeed = createMockFeed();
    mockCommitDelete.mockResolvedValue(true);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
    mockCommitDelete.mockResolvedValue(true);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        title: 'Feed deleted',
      });
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('stays on the current route after deleting an inactive explicitly supplied feed', async () => {
    const mockFeed = createMockFeed({ id: 'feed-inactive' });
    mockUsePathname.mockReturnValue('/home');
    mockCommitDelete.mockResolvedValue(true);

    render(
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
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
      <CustomFeedDialog mode="edit" feed={mockFeed} open>
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not delete feed. Try again.',
      });
    });
  });
});
