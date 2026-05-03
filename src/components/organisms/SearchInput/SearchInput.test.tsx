import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import type { Pubky } from '@/models/models.types';
import { useSearchStore } from '@/stores/search/search.store';
import { SearchInput } from './SearchInput';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
const mockPathname = vi.fn(() => '/home');
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname(),
  useIsMobile: () => false,
}));

// Mock hooks
const mockAddTagToSearch = vi.fn();
const mockRemoveTagFromSearch = vi.fn();
vi.mock('@/hooks/useSearchInput/useSearchInput', () => ({
  useSearchInput: vi.fn(() => ({
    inputValue: '',
    isFocused: false,
    containerRef: { current: null },
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleFocus: vi.fn(),
    clearInputValue: vi.fn(),
  })),
}));

vi.mock('@/hooks/useHotTags/useHotTags', () => ({
  useHotTags: vi.fn(() => ({
    tags: [{ name: 'pubky', count: 10 }],
    rawTags: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useSearchAutocomplete/useSearchAutocomplete', () => ({
  useSearchAutocomplete: vi.fn(() => ({
    tags: [],
    users: [],
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useTagSearch/useTagSearch', () => ({
  useTagSearch: vi.fn(() => ({
    addTagToSearch: mockAddTagToSearch,
    removeTagFromSearch: mockRemoveTagFromSearch,
    activeTags: [],
    isReadOnly: false,
  })),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => false,
}));

// Mock dependencies
const mockAddUser = vi.fn();
const mockAddTag = vi.fn();
const mockSetActiveTags = vi.fn();
const mockAddActiveTag = vi.fn();
const mockRemoveActiveTag = vi.fn();
vi.mock('@/stores/search/search.store', () => ({
  useSearchStore: vi.fn(() => ({
    activeTags: [],
    setActiveTags: mockSetActiveTags,
    addActiveTag: mockAddActiveTag,
    removeActiveTag: mockRemoveActiveTag,
    recentUsers: [],
    recentTags: [],
    addUser: mockAddUser,
    addTag: mockAddTag,
  })),
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      style,
      ...props
    }: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>) => (
      <div className={className} style={style} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Input/Input', () => {
  return {
    Input: ({
      type,
      placeholder,
      value,
      onChange,
      onKeyDown,
      onFocus,
      readOnly,
      className,
      ...props
    }: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        readOnly={readOnly}
        className={className}
        {...props}
      />
    ),
  };
});

// Mock molecules
vi.mock('@/molecules/SearchInputBar/SearchInputBar', () => {
  return {
    SearchInputBar: ({
      activeTags,
      inputValue,
      isFocused,
      isReadOnly,
      isExpanded,
      suggestionsId,
      onTagRemove,
      onInputChange,
      onKeyDown,
      onFocus,
    }: {
      activeTags: string[];
      inputValue: string;
      isFocused: boolean;
      isReadOnly: boolean;
      isExpanded?: boolean;
      suggestionsId?: string;
      onTagRemove: (tag: string) => void;
      onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
      onFocus: () => void;
    }) => (
      <div
        data-testid="search-input-bar"
        className={isFocused ? 'rounded-t-2xl' : 'rounded-full'}
        style={isFocused ? { background: 'linear-gradient(180deg, #05050A 0%, rgba(5, 5, 10, 0.50) 100%)' } : undefined}
      >
        {activeTags.length > 0 && (
          <div role="list" aria-label="Active search tags">
            {activeTags.map((tag) => (
              <span key={tag} data-testid={`active-tag-${tag}`}>
                {tag}
                <button data-testid={`remove-tag-${tag}`} onClick={() => onTagRemove(tag)}>
                  x
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          placeholder={activeTags.length > 0 ? '' : 'Search'}
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          readOnly={isReadOnly}
          aria-label="Search input"
          aria-autocomplete="list"
          aria-controls={suggestionsId || undefined}
          aria-expanded={isExpanded}
        />
        <svg data-testid="search-icon" />
      </div>
    ),
  };
});

vi.mock('@/molecules/SearchRecentUserItem/SearchRecentUserItem.types', () => {
  return {
    RecentUserSearchItem: {} as { id: Pubky; searchedAt: number },
    RecentTagSearchItem: {} as { tag: string; searchedAt: number },
  };
});

vi.mock('@/molecules/SearchSuggestions/SearchSuggestions', () => {
  return {
    SearchSuggestions: ({
      hotTags,
      onTagClick,
      ...props
    }: {
      hotTags: Array<{ name: string }>;
      inputValue: string;
      hasInput: boolean;
      autocompleteTags?: Array<{ name: string }>;
      autocompleteUsers?: Array<{ id: string; name: string; avatarUrl?: string }>;
      recentUsers?: Array<{ id: string; searchedAt: number }>;
      recentTags?: Array<{ tag: string; searchedAt: number }>;
      onTagClick: (tag: string | { tag: string; searchedAt: number }) => void;
      onUserClick: (userId: string | { id: string; searchedAt: number }) => void;
      onSearchAsTagClick?: (query: string) => void;
      onClearRecentSearches?: () => void;
    }) => (
      <div data-testid="search-suggestions" {...props}>
        {hotTags.map((tag) => (
          <button key={tag.name} data-testid={`hot-tag-${tag.name}`} onClick={() => onTagClick(tag.name)}>
            {tag.name}
          </button>
        ))}
      </div>
    ),
  };
});

describe('SearchInput', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset URL search params
    mockSearchParams.delete('tags');
    // Reset hooks to default state before each test
    vi.mocked(useSearchInput).mockReturnValue({
      inputValue: '',
      isFocused: false,
      containerRef: { current: null },
      inputRef: { current: null },
      handleInputChange: vi.fn(),
      handleKeyDown: vi.fn(),
      handleFocus: vi.fn(),
      clearInputValue: vi.fn(),
      setFocus: vi.fn(),
    });
    vi.mocked(useHotTags).mockReturnValue({
      tags: [{ name: 'pubky', count: 10 }],
      rawTags: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(useSearchAutocomplete).mockReturnValue({
      tags: [],
      users: [],
      isLoading: false,
    });
    vi.mocked(useTagSearch).mockReturnValue({
      addTagToSearch: mockAddTagToSearch,
      removeTagFromSearch: mockRemoveTagFromSearch,
      activeTags: [],
      isReadOnly: false,
    });
    // Reset dependency mocks
    vi.mocked(useSearchStore).mockReturnValue({
      activeTags: [],
      setActiveTags: mockSetActiveTags,
      addActiveTag: mockAddActiveTag,
      removeActiveTag: mockRemoveActiveTag,
      recentUsers: [],
      recentTags: [],
      addUser: mockAddUser,
      addTag: mockAddTag,
    });
  });

  describe('Rendering', () => {
    it('renders the search input container', () => {
      render(<SearchInput />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });

    it('renders the search icon', () => {
      render(<SearchInput />);

      expect(screen.getByTestId('search-icon')).toBeInTheDocument();
    });

    it('does not render combobox role on container (suggestions are button-based, not listbox)', () => {
      render(<SearchInput />);

      const container = screen.getByTestId('search-input');
      expect(container).not.toHaveAttribute('role');
    });

    it('renders input with correct aria attributes', () => {
      render(<SearchInput />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-label', 'Search input');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('renders placeholder text when no active tags', () => {
      render(<SearchInput />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('placeholder', 'Search');
    });
  });

  describe('Active Tags', () => {
    it('renders active tags when present', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin', 'pubky'],
        isReadOnly: false,
      });

      render(<SearchInput />);

      expect(screen.getByTestId('active-tag-bitcoin')).toBeInTheDocument();
      expect(screen.getByTestId('active-tag-pubky')).toBeInTheDocument();
    });

    it('renders empty placeholder when active tags present', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin'],
        isReadOnly: false,
      });

      render(<SearchInput />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('placeholder', '');
    });

    it('renders active tags list with aria-label', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin'],
        isReadOnly: false,
      });

      render(<SearchInput />);

      const tagsList = screen.getByRole('list');
      expect(tagsList).toHaveAttribute('aria-label', 'Active search tags');
    });
  });

  describe('Suggestions Dropdown', () => {
    it('does not show suggestions when not focused', async () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: false,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setFocus: vi.fn(),
      });

      render(<SearchInput />);

      expect(screen.queryByTestId('search-suggestions')).not.toBeInTheDocument();
    });

    it('shows suggestions when focused and has hot tags', async () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setFocus: vi.fn(),
      });
      vi.mocked(useHotTags).mockReturnValue({
        tags: [{ name: 'pubky', count: 10 }],
        rawTags: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<SearchInput />);

      expect(screen.getByTestId('search-suggestions')).toBeInTheDocument();
    });

    it('has correct aria attributes when suggestions visible', async () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setFocus: vi.fn(),
      });
      vi.mocked(useHotTags).mockReturnValue({
        tags: [{ name: 'pubky', count: 10 }],
        rawTags: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<SearchInput />);

      const container = screen.getByTestId('search-input');
      expect(container).not.toHaveAttribute('role');
      expect(container).not.toHaveAttribute('aria-owns');
    });

    it('has correct aria attributes when suggestions hidden', async () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: false,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setFocus: vi.fn(),
      });
      vi.mocked(useHotTags).mockReturnValue({
        tags: [],
        rawTags: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<SearchInput />);

      const container = screen.getByTestId('search-input');
      expect(container).not.toHaveAttribute('role');
      expect(container).not.toHaveAttribute('aria-owns');
    });
  });

  describe('Tag Click Handling', () => {
    it('calls addTagToSearch with addToRecent when tag clicked from suggestions', async () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setFocus: vi.fn(),
      });
      vi.mocked(useHotTags).mockReturnValue({
        tags: [{ name: 'pubky', count: 10 }],
        rawTags: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<SearchInput />);

      fireEvent.click(screen.getByTestId('hot-tag-pubky'));

      expect(mockAddTagToSearch).toHaveBeenCalledWith('pubky', { addToRecent: true });
    });
  });

  describe('Active Tag Removal', () => {
    it('calls removeTagFromSearch when close button clicked', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin', 'pubky'],
        isReadOnly: false,
      });

      render(<SearchInput />);

      fireEvent.click(screen.getByTestId('remove-tag-bitcoin'));

      expect(mockRemoveTagFromSearch).toHaveBeenCalledWith('bitcoin');
    });
  });

  describe('ReadOnly State', () => {
    it('sets input to readOnly when at max tags', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['tag1', 'tag2', 'tag3'],
        isReadOnly: true,
      });

      render(<SearchInput />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('readOnly');
    });
  });

  describe('SearchInput - Snapshots', () => {
    it('matches snapshot - default state', () => {
      const { container } = render(<SearchInput />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot - with active tags', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin', 'pubky'],
        isReadOnly: false,
      });

      const { container } = render(<SearchInput />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot - focused with suggestions', async () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setFocus: vi.fn(),
      });
      vi.mocked(useHotTags).mockReturnValue({
        tags: [
          { name: 'pubky', count: 10 },
          { name: 'bitcoin', count: 5 },
        ],
        rawTags: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = render(<SearchInput />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
