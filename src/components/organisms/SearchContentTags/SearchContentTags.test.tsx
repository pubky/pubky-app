import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { SearchContentTags } from './SearchContentTags';

const { mockUseSearchCriteria, mockUseContentSearchTags, mockAddTagToSearch } = vi.hoisted(() => ({
  mockUseSearchCriteria: vi.fn((): SearchCriteria => ({ mode: 'content', query: 'bitcoin design' })),
  mockUseContentSearchTags: vi.fn((_query: string | null) => ({ tags: ['bitcoin', 'design'] })),
  mockAddTagToSearch: vi.fn(),
}));

vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({
  useSearchCriteria: () => mockUseSearchCriteria(),
}));

vi.mock('@/hooks/useContentSearchTags/useContentSearchTags', () => ({
  useContentSearchTags: (query: string | null) => mockUseContentSearchTags(query),
}));

vi.mock('@/hooks/useTagSearch/useTagSearch', () => ({
  useTagSearch: () => ({ addTagToSearch: mockAddTagToSearch, removeTagFromSearch: vi.fn(), activeTags: [] }),
}));

describe('SearchContentTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'bitcoin design' });
    mockUseContentSearchTags.mockReturnValue({ tags: ['bitcoin', 'design'] });
  });

  it('renders the Tags heading and one chip per tag', () => {
    render(<SearchContentTags />);

    expect(screen.getByRole('heading', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'bitcoin tag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'design tag' })).toBeInTheDocument();
  });

  it('passes the content query to the hook, and null for every other mode', () => {
    render(<SearchContentTags />);
    expect(mockUseContentSearchTags).toHaveBeenCalledWith('bitcoin design');

    mockUseContentSearchTags.mockClear();
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    render(<SearchContentTags />);
    expect(mockUseContentSearchTags).toHaveBeenCalledWith(null);
  });

  it('pivots to a tag search (recorded as recent) when a chip is clicked', async () => {
    const user = userEvent.setup();
    render(<SearchContentTags />);

    await user.click(screen.getByRole('button', { name: 'design tag' }));

    expect(mockAddTagToSearch).toHaveBeenCalledExactlyOnceWith('design', { addToRecent: true });
  });

  it('renders nothing when there are no matches', () => {
    mockUseContentSearchTags.mockReturnValue({ tags: [] });

    const { container } = render(<SearchContentTags />);

    expect(container).toBeEmptyDOMElement();
  });

  it('matches snapshot', () => {
    const { container } = render(<SearchContentTags />);
    expect(container).toMatchSnapshot();
  });
});
