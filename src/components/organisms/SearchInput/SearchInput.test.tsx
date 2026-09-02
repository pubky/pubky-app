import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { toast } from '@/molecules/Toaster/toast';
import { useSearchStore } from '@/stores/search/search.store';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { SearchInput } from './SearchInput';

// Mock next/navigation
const mockPush = vi.fn();
const mockPathname = vi.fn(() => '/home');
const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname(),
}));

// Mock hooks
const mockAddTagToSearch = vi.fn();
const mockRemoveTagFromSearch = vi.fn();
vi.mock('@/hooks/useSearchInput/useSearchInput', () => ({
  useSearchInput: vi.fn(() => ({
    inputValue: '',
    isFocused: false,
    containerRef: { current: null },
    inputRef: { current: null },
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleFocus: vi.fn(),
    clearInputValue: vi.fn(),
    setInputValue: vi.fn(),
    setFocus: vi.fn(),
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
  })),
}));

vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({
  useSearchCriteria: vi.fn(() => ({ mode: 'none' })),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

vi.mock('@/molecules/Toaster/toast');

// Mock dependencies
const mockAddUser = vi.fn();
const mockAddTag = vi.fn();
const mockAddQuery = vi.fn();
const mockSetActiveTags = vi.fn();
const mockAddActiveTag = vi.fn();
const mockRemoveActiveTag = vi.fn();
const mockClearRecentSearches = vi.fn();
vi.mock('@/stores/search/search.store', () => ({
  useSearchStore: vi.fn(() => ({
    activeTags: [],
    setActiveTags: mockSetActiveTags,
    addActiveTag: mockAddActiveTag,
    removeActiveTag: mockRemoveActiveTag,
    recentUsers: [],
    recentTags: [],
    recentQueries: [],
    addUser: mockAddUser,
    addTag: mockAddTag,
    addQuery: mockAddQuery,
    clearRecentSearches: mockClearRecentSearches,
  })),
}));

describe('SearchInput', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset hooks to default state before each test
    vi.mocked(useSearchCriteria).mockReturnValue({ mode: 'none' });
    vi.mocked(useSearchInput).mockReturnValue({
      inputValue: '',
      isFocused: false,
      containerRef: { current: null },
      inputRef: { current: null },
      handleInputChange: vi.fn(),
      handleKeyDown: vi.fn(),
      handleFocus: vi.fn(),
      clearInputValue: vi.fn(),
      setInputValue: vi.fn(),
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
    });
    // Reset dependency mocks
    vi.mocked(useSearchStore).mockReturnValue({
      activeTags: [],
      setActiveTags: mockSetActiveTags,
      addActiveTag: mockAddActiveTag,
      removeActiveTag: mockRemoveActiveTag,
      recentUsers: [],
      recentTags: [],
      recentQueries: [],
      addUser: mockAddUser,
      addTag: mockAddTag,
      addQuery: mockAddQuery,
      clearRecentSearches: mockClearRecentSearches,
    });
  });

  describe('Rendering', () => {
    it('renders the search input container', () => {
      render(<SearchInput />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });

    it('renders the search icon', () => {
      const { container } = render(<SearchInput />);

      expect(container.querySelector('svg.lucide-search')).toBeInTheDocument();
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
      });

      render(<SearchInput />);

      expect(screen.getByRole('button', { name: 'bitcoin tag' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'pubky tag' })).toBeInTheDocument();
    });

    it('renders empty placeholder when active tags present', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin'],
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
        setInputValue: vi.fn(),
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
        setInputValue: vi.fn(),
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
        setInputValue: vi.fn(),
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
        setInputValue: vi.fn(),
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
        setInputValue: vi.fn(),
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

      fireEvent.click(screen.getByRole('button', { name: 'pubky tag' }));

      expect(mockAddTagToSearch).toHaveBeenCalledWith('pubky', { addToRecent: true });
    });
  });

  describe('User Click Handling', () => {
    it('routes user suggestions to the canonical profile page', () => {
      const clearInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'satoshi',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue,
        setInputValue: vi.fn(),
        setFocus,
      });
      vi.mocked(useSearchAutocomplete).mockReturnValue({
        tags: [],
        users: [{ id: 'user123', name: 'Satoshi' }],
        isLoading: false,
      });

      render(<SearchInput />);

      fireEvent.click(screen.getByTestId('search-user-suggestion-user123'));

      expect(mockAddUser).toHaveBeenCalledWith('user123');
      expect(clearInputValue).toHaveBeenCalled();
      expect(setFocus).toHaveBeenCalledWith(false);
      expect(mockPush).toHaveBeenCalledWith('/profile/user123');
    });
  });

  describe('Content Search', () => {
    it('ignores active tags when a valid q parameter is present', () => {
      const setInputValue = vi.fn();
      vi.mocked(useSearchCriteria).mockReturnValue({ mode: 'content', query: 'bitcoin' });
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: false,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus: vi.fn(),
      });
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['nostr', 'pubky'],
      });

      render(<SearchInput />);

      expect(screen.queryByRole('button', { name: 'nostr tag' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'pubky tag' })).not.toBeInTheDocument();
      expect(mockSetActiveTags).toHaveBeenCalledWith([]);
      expect(setInputValue).toHaveBeenCalledWith('bitcoin');
    });

    it('seeds an invalid shared query into the input for editing', () => {
      const setInputValue = vi.fn();
      vi.mocked(useSearchCriteria).mockReturnValue({
        mode: 'invalid',
        message: 'Search can contain up to 4 terms',
        query: 'one two three four five',
      });
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: false,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus: vi.fn(),
      });

      render(<SearchInput />);

      expect(setInputValue).toHaveBeenCalledWith('one two three four five');
    });

    it('leaves a typed draft untouched when the criteria are not a full-text query', () => {
      const setInputValue = vi.fn();
      vi.mocked(useSearchCriteria).mockReturnValue({ mode: 'tags', tags: ['bitcoin'] });
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'wal',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus: vi.fn(),
      });

      render(<SearchInput />);

      // Nothing was ever seeded, so the sync effect must not touch the draft
      expect(setInputValue).not.toHaveBeenCalled();
    });

    it('uses the same q-only navigation for Enter and Show all results', () => {
      const setInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'bitcoin wallet',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus,
      });

      render(<SearchInput />);
      // The URL-sync effect clears tags on mount (default criteria are mode
      // 'none') — reset to prove the submit path itself never touches them:
      // chips must stay visible until the URL actually flips to content mode.
      mockSetActiveTags.mockClear();

      const onEnter = vi.mocked(useSearchInput).mock.calls[0]?.[0]?.onEnter;
      onEnter?.('bitcoin wallet');
      expect(mockPush).toHaveBeenLastCalledWith('/search?q=bitcoin+wallet');
      expect(mockAddQuery).toHaveBeenCalledWith('bitcoin wallet');
      expect(mockSetActiveTags).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Show all results' }));
      expect(mockPush).toHaveBeenLastCalledWith('/search?q=bitcoin+wallet');
      expect(mockAddQuery).toHaveBeenCalledTimes(2);
      expect(mockSetActiveTags).not.toHaveBeenCalled();
      // Submit keeps the query visible in the input (same-URL resubmits never re-seed)
      expect(setInputValue).toHaveBeenCalledWith('bitcoin wallet');
      expect(setFocus).toHaveBeenCalledWith(false);
    });

    it('keeps invalid full-text input open and reports the Nexus constraint', () => {
      const clearInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'b',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue,
        setInputValue: vi.fn(),
        setFocus,
      });

      render(<SearchInput />);
      fireEvent.click(screen.getByRole('button', { name: 'Show all results' }));

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Search must be at least 2 characters',
      });
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockAddQuery).not.toHaveBeenCalled();
      expect(clearInputValue).not.toHaveBeenCalled();
      expect(setFocus).not.toHaveBeenCalled();
    });

    it('re-runs a recent full-text query when its chip is clicked', () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue: vi.fn(),
        setFocus: vi.fn(),
      });
      vi.mocked(useSearchStore).mockReturnValue({
        activeTags: [],
        setActiveTags: mockSetActiveTags,
        addActiveTag: mockAddActiveTag,
        removeActiveTag: mockRemoveActiveTag,
        recentUsers: [],
        recentTags: [],
        recentQueries: [{ query: 'bitcoin wallet', searchedAt: 1 }],
        addUser: mockAddUser,
        addTag: mockAddTag,
        addQuery: mockAddQuery,
        clearRecentSearches: mockClearRecentSearches,
      });

      render(<SearchInput />);

      const queryChip = screen.getByTestId('recent-query-bitcoin wallet');
      expect(queryChip).toBeInTheDocument();

      fireEvent.click(queryChip);

      expect(mockPush).toHaveBeenCalledWith('/search?q=bitcoin+wallet');
      expect(mockAddQuery).toHaveBeenCalledWith('bitcoin wallet');
    });

    it('clears a plain draft without navigating from the X action', () => {
      const setInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'bitcoin',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus,
      });

      render(<SearchInput />);
      fireEvent.click(screen.getByRole('button', { name: 'Clear and close search' }));

      expect(setInputValue).toHaveBeenLastCalledWith('');
      expect(mockPush).not.toHaveBeenCalled();
      expect(setFocus).toHaveBeenCalledWith(false);
    });

    it('deletes the active search from the bar via the X action', () => {
      const setInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchCriteria).mockReturnValue({ mode: 'content', query: 'bitcoin wallet' });
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'bitcoin wallet',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus,
      });

      render(<SearchInput />);
      fireEvent.click(screen.getByRole('button', { name: 'Clear and close search' }));

      expect(setInputValue).toHaveBeenLastCalledWith('');
      expect(mockPush).toHaveBeenCalledWith('/search');
      expect(setFocus).toHaveBeenCalledWith(false);
    });

    it('deletes active tag chips from the bar via the X action', () => {
      const setInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchCriteria).mockReturnValue({ mode: 'tags', tags: ['bitcoin', 'pubky'] });
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: '',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus,
      });

      render(<SearchInput />);
      fireEvent.click(screen.getByRole('button', { name: 'Clear and close search' }));

      // Navigating to the bare search route drops the tags param; the URL sync clears the chips
      expect(mockPush).toHaveBeenCalledWith('/search');
      expect(setFocus).toHaveBeenCalledWith(false);
    });

    it('does not re-run the URL sync when the criteria identity churns without a value change', () => {
      const setInputValue = vi.fn();
      // Fresh object every render — the app cannot rely on React Compiler
      // memoization for correctness (the vitest/VRT pipeline runs without it).
      vi.mocked(useSearchCriteria).mockImplementation(() => ({ mode: 'tags', tags: ['bitcoin'] }));
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'draft',
        isFocused: false,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue,
        setFocus: vi.fn(),
      });

      const { rerender } = render(<SearchInput />);
      const callsAfterMount = mockSetActiveTags.mock.calls.length;
      rerender(<SearchInput />);

      expect(mockSetActiveTags).toHaveBeenCalledTimes(callsAfterMount);
      expect(setInputValue).not.toHaveBeenCalled();
    });
  });

  describe('Active Tag Removal', () => {
    it('calls removeTagFromSearch when close button clicked', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin', 'pubky'],
      });

      render(<SearchInput />);

      fireEvent.click(screen.getByRole('button', { name: 'Remove bitcoin tag' }));

      expect(mockRemoveTagFromSearch).toHaveBeenCalledWith('bitcoin');
    });
  });

  describe('SearchInput - Snapshots', () => {
    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it('matches snapshot - default state', () => {
      const { container } = render(<SearchInput />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot - with active tags', async () => {
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['bitcoin', 'pubky'],
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
        setInputValue: vi.fn(),
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

    it('matches snapshot - focused with the full-text action', () => {
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'bitcoin',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue: vi.fn(),
        setInputValue: vi.fn(),
        setFocus: vi.fn(),
      });

      const { container } = render(<SearchInput />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

describe('SearchInput - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchCriteria).mockReturnValue({ mode: 'none' });
    vi.mocked(useSearchInput).mockReturnValue({
      inputValue: '',
      isFocused: false,
      containerRef: { current: null },
      inputRef: { current: null },
      handleInputChange: vi.fn(),
      handleKeyDown: vi.fn(),
      handleFocus: vi.fn(),
      clearInputValue: vi.fn(),
      setInputValue: vi.fn(),
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
    });
    vi.mocked(useSearchStore).mockReturnValue({
      activeTags: [],
      setActiveTags: mockSetActiveTags,
      addActiveTag: mockAddActiveTag,
      removeActiveTag: mockRemoveActiveTag,
      recentUsers: [],
      recentTags: [],
      recentQueries: [],
      addUser: mockAddUser,
      addTag: mockAddTag,
      addQuery: mockAddQuery,
      clearRecentSearches: mockClearRecentSearches,
    });
    mockUseIsMobile.mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<SearchInput />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
