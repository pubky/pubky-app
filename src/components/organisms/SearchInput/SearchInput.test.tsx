import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { useSearchStore } from '@/stores/search/search.store';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { SearchInput } from './SearchInput';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
const mockPathname = vi.fn(() => '/home');
const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
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
  useIsMobile: mockUseIsMobile,
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: mockToast,
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

describe('SearchInput', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset URL search params
    mockSearchParams.delete('q');
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
        isReadOnly: false,
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
      mockSearchParams.set('q', 'bitcoin');
      mockSearchParams.set('tags', 'nostr,pubky');
      vi.mocked(useTagSearch).mockReturnValue({
        addTagToSearch: mockAddTagToSearch,
        removeTagFromSearch: mockRemoveTagFromSearch,
        activeTags: ['nostr', 'pubky'],
        isReadOnly: true,
      });

      render(<SearchInput />);

      expect(screen.queryByRole('button', { name: 'nostr tag' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'pubky tag' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).not.toHaveAttribute('readOnly');
      expect(mockSetActiveTags).toHaveBeenCalledWith([]);
    });

    it('uses the same q-only navigation for Enter and Show all results', () => {
      const clearInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'bitcoin wallet',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue,
        setFocus,
      });

      render(<SearchInput />);

      const onEnter = vi.mocked(useSearchInput).mock.calls[0]?.[0]?.onEnter;
      expect(onEnter?.('bitcoin wallet')).toBe(true);
      expect(mockPush).toHaveBeenLastCalledWith('/search?q=bitcoin+wallet');

      fireEvent.click(screen.getByRole('button', { name: 'Show all results' }));
      expect(mockPush).toHaveBeenLastCalledWith('/search?q=bitcoin+wallet');
      expect(mockSetActiveTags).toHaveBeenCalledWith([]);
      expect(clearInputValue).toHaveBeenCalledOnce();
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
        setFocus,
      });

      render(<SearchInput />);
      fireEvent.click(screen.getByRole('button', { name: 'Show all results' }));

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Search must be at least 2 characters',
      });
      expect(mockPush).not.toHaveBeenCalled();
      expect(clearInputValue).not.toHaveBeenCalled();
      expect(setFocus).not.toHaveBeenCalled();
    });

    it('clears and collapses the active search from the X action', () => {
      const clearInputValue = vi.fn();
      const setFocus = vi.fn();
      vi.mocked(useSearchInput).mockReturnValue({
        inputValue: 'bitcoin',
        isFocused: true,
        containerRef: { current: null },
        inputRef: { current: null },
        handleInputChange: vi.fn(),
        handleKeyDown: vi.fn(),
        handleFocus: vi.fn(),
        clearInputValue,
        setFocus,
      });

      render(<SearchInput />);
      fireEvent.click(screen.getByRole('button', { name: 'Clear and close search' }));

      expect(clearInputValue).toHaveBeenCalledOnce();
      expect(setFocus).toHaveBeenCalledWith(false);
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

      fireEvent.click(screen.getByRole('button', { name: 'Remove bitcoin tag' }));

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
    mockSearchParams.delete('tags');
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
