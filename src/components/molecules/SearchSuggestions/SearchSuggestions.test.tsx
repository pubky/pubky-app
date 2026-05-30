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
    inputValue: '',
    onTagClick: vi.fn(),
    onUserClick: vi.fn(),
    onRecentUserClick: vi.fn(),
    onRecentTagClick: vi.fn(),
  };

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
  });
});
