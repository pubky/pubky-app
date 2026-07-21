import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockUseCustomFeed = vi.fn();
vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
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
      className,
      'data-testid': dataTestId,
    }: {
      onTagAdd: (tag: string) => void;
      existingTags: { label: string }[];
      showCloseButton?: boolean;
      disabled?: boolean;
      maxTags?: number;
      currentTagsCount?: number;
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
        className={className}
      >
        <input
          data-testid="tag-input-field"
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
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      onClick?: () => void;
      disabled?: boolean;
      className?: string;
      'data-testid'?: string;
    }) => (
      <button
        data-testid={dataTestId ?? `button-${variant ?? 'default'}`}
        data-variant={variant}
        data-size={size}
        onClick={onClick}
        disabled={disabled}
        className={className}
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
    SelectItem: ({ children }: { children: React.ReactNode; key?: string; value: string }) => (
      <div data-testid="select-item">{children}</div>
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
  tags: ['bitcoin', 'lightning'],
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
    mockUseCustomFeed.mockReturnValue(undefined);
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
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
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

  it('renders feed name input as enabled in edit mode when customFeed is defined', () => {
    const mockFeed = createMockFeed();
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).not.toBeDisabled();
  });

  it('renders feed name input as disabled in edit mode when customFeed is undefined', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const input = screen.getByTestId('feed-name-input');
    expect(input).toBeDisabled();
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

  it('renders tag input component', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('feed-tag-input')).toBeInTheDocument();
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
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    const deleteButton = screen.getByTestId('delete-feed-button');
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveTextContent('Delete Feed');
  });

  it('applies w-3xl class to dialog content', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-content')).toHaveClass('w-3xl');
  });

  // -- Trigger disabled state --

  it('disables dialog trigger in edit mode when customFeed is undefined', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).toHaveAttribute('data-disabled', 'true');
  });

  it('does not disable dialog trigger in edit mode when customFeed is defined', () => {
    const mockFeed = createMockFeed();
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).toHaveAttribute('data-disabled', 'false');
  });

  it('does not disable dialog trigger in create mode', () => {
    render(
      <CustomFeedDialog mode="create">
        <button>Create Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('custom-feed-dialog-trigger')).toHaveAttribute('data-disabled', 'false');
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

  it('disables Save Feed button in edit mode when customFeed is undefined', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('save-feed-button')).toBeDisabled();
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
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('post-tag-bitcoin')).toBeInTheDocument();
    expect(screen.getByTestId('post-tag-lightning')).toBeInTheDocument();
  });

  it('shows close buttons on tags when not disabled', () => {
    const mockFeed = createMockFeed({ tags: ['bitcoin'] });
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
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

    const section = screen.getByTestId('reach-filter-section');
    expect(within(section).getByText('All')).toBeInTheDocument();
    expect(within(section).getByText('Following')).toBeInTheDocument();
    expect(within(section).getByText('Friends')).toBeInTheDocument();
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
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('feed-name-input')).toHaveValue('Bitcoin News');
  });

  it('populates reach select from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ reach: PubkyAppFeedReach.Friends });
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('reach-select')).toHaveAttribute('data-value', String(PubkyAppFeedReach.Friends));
  });

  it('maps null content from customFeed to ALL in edit mode', () => {
    const mockFeed = createMockFeed({ content: null });
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('content-select')).toHaveAttribute('data-value', 'ALL');
  });

  it('populates visual layout from customFeed in edit mode', () => {
    const mockFeed = createMockFeed({ layout: PubkyAppFeedLayout.Visual, content: PubkyAppPostKind.Video });
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('layout-select')).toHaveAttribute('data-value', String(PubkyAppFeedLayout.Visual));
  });

  it('normalizes unsupported visual content from customFeed to ALL in edit mode', async () => {
    const mockFeed = createMockFeed({ layout: PubkyAppFeedLayout.Visual, content: PubkyAppPostKind.Short });
    mockUseCustomFeed.mockReturnValue(mockFeed);

    render(
      <CustomFeedDialog mode="edit">
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
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitCreate).toHaveBeenCalledWith({
        name: 'My Feed',
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        layout: PubkyAppFeedLayout.Columns,
        content: null, // ALL maps to null
        tags: ['bitcoin'],
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
    mockUseCustomFeed.mockReturnValue(mockFeed);

    const mockUpdatedFeed = createMockFeed({ id: 'feed-abc123', name: 'Bitcoin News' });
    mockCommitUpdate.mockResolvedValue(mockUpdatedFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    // Add a new tag (existing tags are populated from customFeed)
    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockCommitUpdate).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: {
          name: 'Bitcoin News',
          reach: PubkyAppFeedReach.Following,
          sort: PubkyAppFeedSort.Popularity,
          layout: PubkyAppFeedLayout.Wide,
          content: PubkyAppPostKind.Short,
          tags: ['bitcoin', 'lightning', 'crypto'],
        },
      });
    });
  });

  it('shows success toast and navigates after successful edit', async () => {
    const mockFeed = createMockFeed();
    mockUseCustomFeed.mockReturnValue(mockFeed);

    const mockUpdatedFeed = createMockFeed({ id: 'feed-abc123', name: 'Bitcoin News' });
    mockCommitUpdate.mockResolvedValue(mockUpdatedFeed);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
    fireEvent.click(screen.getByTestId('save-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Feed updated: Bitcoin News',
      });
      expect(mockPush).toHaveBeenCalledWith('/feed/feed-abc123');
    });
  });

  it('shows error toast when edit fails', async () => {
    const mockFeed = createMockFeed();
    mockUseCustomFeed.mockReturnValue(mockFeed);
    mockCommitUpdate.mockRejectedValue(new Error('Network error'));

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'crypto' } });
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
    mockUseCustomFeed.mockReturnValue(mockFeed);
    mockCommitUpdate.mockResolvedValue(createMockFeed());

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.change(screen.getByTestId('tag-input-field'), { target: { value: 'photo' } });
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
    mockUseCustomFeed.mockReturnValue(mockFeed);
    mockCommitDelete.mockResolvedValue(undefined);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(mockCommitDelete).toHaveBeenCalledWith({ feedId: 'feed-abc123' });
    });
  });

  it('shows success toast and navigates to home after successful delete', async () => {
    const mockFeed = createMockFeed();
    mockUseCustomFeed.mockReturnValue(mockFeed);
    mockCommitDelete.mockResolvedValue(undefined);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    fireEvent.click(screen.getByTestId('delete-feed-button'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Feed deleted: Bitcoin News',
      });
      expect(mockPush).toHaveBeenCalledWith('/home');
    });
  });

  it('shows error toast when delete fails', async () => {
    const mockFeed = createMockFeed();
    mockUseCustomFeed.mockReturnValue(mockFeed);
    mockCommitDelete.mockRejectedValue(new Error('Delete failed'));

    render(
      <CustomFeedDialog mode="edit">
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

  it('disables delete button when customFeed is undefined', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );

    expect(screen.getByTestId('delete-feed-button')).toBeDisabled();
  });
});

// --- Snapshot Tests ---

describe('CustomFeedDialog - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCustomFeed.mockReturnValue(undefined);
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
    mockUseCustomFeed.mockReturnValue(mockFeed);

    const { container } = render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit mode without custom feed (disabled)', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    const { container } = render(
      <CustomFeedDialog mode="edit">
        <button>Edit Feed</button>
      </CustomFeedDialog>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for edit mode with null content feed', () => {
    const mockFeed = createMockFeed({ content: null, tags: ['bitcoin'] });
    mockUseCustomFeed.mockReturnValue(mockFeed);

    const { container } = render(
      <CustomFeedDialog mode="edit">
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
