import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchSuggestions } from './SearchSuggestions';

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      style,
      overrideDefaults,
      ...props
    }: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties; overrideDefaults?: boolean }>) => (
      <div
        data-testid="container"
        className={className}
        style={style}
        data-override-defaults={overrideDefaults}
        {...props}
      >
        {children}
      </div>
    ),
  };
});

vi.mock('@/molecules/SearchTagSection/SearchTagSection', () => {
  return {
    SearchTagSection: ({
      title,
      tags,
      onTagClick,
    }: {
      title: string;
      tags: Array<{ name: string }>;
      onTagClick: (tag: string) => void;
    }) => (
      <div data-testid={`section-${title.toLowerCase().replace(/\s/g, '-')}`}>
        <span>{title}</span>
        {tags.map((tag) => (
          <button key={tag.name} data-testid={`tag-${tag.name}`} onClick={() => onTagClick(tag.name)}>
            {tag.name}
          </button>
        ))}
      </div>
    ),
  };
});

vi.mock('@/config/search', () => ({
  SEARCH_EXPANDED_STYLE: {
    background: 'linear-gradient(180deg, var(--background) 0%, rgba(5, 5, 10, 0.50) 100%)',
    backdropFilter: 'blur(25px)',
    boxShadow: '0px 50px 100px rgba(0, 0, 0, 1)',
    maxHeight: '300px',
  },
}));

describe('SearchSuggestions', () => {
  const hotTags = [
    { name: 'pubky', count: 5 },
    { name: 'keys', count: 3 },
  ];

  const defaultProps = {
    hotTags,
    hasInput: false,
    onTagClick: vi.fn(),
    onUserClick: vi.fn(),
    onQueryClick: vi.fn(),
    onShowAllResults: vi.fn(),
  };

  const recentQueries = [{ query: 'bitcoin wallets', searchedAt: Date.now() }];

  it('renders hot tags section', () => {
    render(<SearchSuggestions {...defaultProps} />);

    expect(screen.getByTestId('section-hot-tags')).toBeInTheDocument();
  });

  it('renders search-suggestions test id', () => {
    render(<SearchSuggestions {...defaultProps} />);

    expect(screen.getByTestId('search-suggestions')).toBeInTheDocument();
  });

  it('calls onTagClick when a tag is clicked', () => {
    const onTagClick = vi.fn();
    render(<SearchSuggestions {...defaultProps} onTagClick={onTagClick} />);

    fireEvent.click(screen.getByTestId('tag-pubky'));

    expect(onTagClick).toHaveBeenCalledWith('pubky');
  });

  it('shows the full-text search action only for non-empty input and invokes it', () => {
    const onShowAllResults = vi.fn();
    const { rerender } = render(<SearchSuggestions {...defaultProps} hasInput onShowAllResults={onShowAllResults} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show all results' }));
    expect(onShowAllResults).toHaveBeenCalledOnce();

    rerender(<SearchSuggestions {...defaultProps} hasInput={false} onShowAllResults={onShowAllResults} />);
    expect(screen.queryByRole('button', { name: 'Show all results' })).not.toBeInTheDocument();
  });

  it('renders recent queries inside the recent section when input is empty', () => {
    render(<SearchSuggestions {...defaultProps} recentQueries={recentQueries} />);

    expect(screen.getByTestId('recent-query-bitcoin wallets')).toBeInTheDocument();
  });

  it('hides recent queries when input has content', () => {
    render(<SearchSuggestions {...defaultProps} hasInput recentQueries={recentQueries} />);

    expect(screen.queryByTestId('recent-query-bitcoin wallets')).not.toBeInTheDocument();
  });

  it('shows the loading skeleton only before the first autocomplete response', () => {
    const { rerender } = render(<SearchSuggestions {...defaultProps} hasInput isLoading />);

    expect(screen.getByTestId('search-suggestions-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('search-suggestions')).toHaveAttribute('aria-busy', 'true');
    // The full-text action stays available while suggestions load.
    expect(screen.getByRole('button', { name: 'Show all results' })).toBeInTheDocument();

    // Stale results from the previous query stay on screen while refreshing.
    rerender(<SearchSuggestions {...defaultProps} hasInput isLoading autocompleteTags={[{ name: 'pubky' }]} />);
    expect(screen.queryByTestId('search-suggestions-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('search-suggestions')).not.toHaveAttribute('aria-busy');
  });

  it('does not show the skeleton without input or after the lookup settles empty', () => {
    const { rerender } = render(<SearchSuggestions {...defaultProps} isLoading />);
    expect(screen.queryByTestId('search-suggestions-skeleton')).not.toBeInTheDocument();

    rerender(<SearchSuggestions {...defaultProps} hasInput isLoading={false} />);
    expect(screen.queryByTestId('search-suggestions-skeleton')).not.toBeInTheDocument();
  });

  it('applies dropdown styles', () => {
    render(<SearchSuggestions {...defaultProps} />);

    const dropdown = screen.getByTestId('search-suggestions');
    expect(dropdown).toHaveStyle({
      background: 'linear-gradient(180deg, var(--background) 0%, rgba(5, 5, 10, 0.50) 100%)',
    });
  });

  it('has correct aria-label and role', () => {
    render(<SearchSuggestions {...defaultProps} aria-label="Search suggestions" />);

    const suggestions = screen.getByTestId('search-suggestions');
    expect(suggestions).toHaveAttribute('role', 'region');
    expect(suggestions).toHaveAttribute('aria-label', 'Search suggestions');
  });

  describe('SearchSuggestions - Snapshots', () => {
    it('matches snapshot with hot tags', () => {
      const { container } = render(<SearchSuggestions {...defaultProps} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with empty hot tags', () => {
      const { container } = render(<SearchSuggestions {...defaultProps} hotTags={[]} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with the full-text action', () => {
      const { container } = render(<SearchSuggestions {...defaultProps} hasInput />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot while suggestions load', () => {
      const { container } = render(<SearchSuggestions {...defaultProps} hasInput isLoading />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
