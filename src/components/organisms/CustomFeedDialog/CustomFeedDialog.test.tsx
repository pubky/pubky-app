import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomFeedDialog } from './CustomFeedDialog';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import type { FeedModelSchema } from '@/core/models/feed/feed.schema';

// Mock router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockUseCustomFeed = vi.fn();
vi.mock('@/hooks', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: () => ({ toast: mockToast }),
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
}));

// Mock core
const mockCommitCreate = vi.fn();
const mockCommitUpdate = vi.fn();
const mockCommitDelete = vi.fn();
vi.mock('@/core', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mockCommitCreate(...args),
    commitUpdate: (...args: unknown[]) => mockCommitUpdate(...args),
    commitDelete: (...args: unknown[]) => mockCommitDelete(...args),
  },
}));

// Mock atoms — use lightweight mocks that forward data-testid attributes
vi.mock('@/atoms', () => ({
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
  Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label data-testid="label" className={className}>
      {children}
    </label>
  ),
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
        type="hidden"
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
}));

// Mock libs — use real implementations but provide icon stubs and Env
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  const IconStub = ({ className }: { className?: string }) => <svg data-testid="icon" className={className} />;
  return {
    ...actual,
    Radio: IconStub,
    UsersRound2: IconStub,
    HeartHandshake: IconStub,
    SquareAsterisk: IconStub,
    Flame: IconStub,
    Columns3: IconStub,
    Menu: IconStub,
    Layers: IconStub,
    StickyNote: IconStub,
    Newspaper: IconStub,
    Image: IconStub,
    CirclePlay: IconStub,
    Link: IconStub,
    Download: IconStub,
    Activity: IconStub,
    Delete: IconStub,
    Env: {
      ...((actual as Record<string, unknown>).Env ?? {}),
      NEXT_MAX_STREAM_TAGS: 5,
    },
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
    expect(within(section).getByText('Images')).toBeInTheDocument();
    expect(within(section).getByText('Videos')).toBeInTheDocument();
    expect(within(section).getByText('Links')).toBeInTheDocument();
    expect(within(section).getByText('Files')).toBeInTheDocument();
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
        title: 'Success',
        description: 'Feed My Feed created!',
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
        title: 'Error',
        description: 'Could not create feed, please try again or reach out to support.',
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
        title: 'Success',
        description: 'Feed Bitcoin News edited!',
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
        title: 'Error',
        description: 'Could not edit feed, please try again or reach out to support.',
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
        title: 'Success',
        description: 'Feed Bitcoin News deleted!',
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
        title: 'Error',
        description: 'Could not delete feed, please try again or reach out to support.',
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
